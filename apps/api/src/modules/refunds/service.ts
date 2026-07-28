import {
  AppError,
  type CreateRefundInput,
  type Principal,
  type ReconcileInput,
  type RefundDecisionInput,
  type RefundQuery,
  type RefundRetryInput,
  assertRefundTransition,
  canRetry,
  checkRefundable,
  notFound,
  refundIdempotencyKey,
  requiresAdminApproval,
  requiresApproval,
  violatesMakerChecker,
} from '@fintech/domain';
import type { Prisma, Refund } from '@fintech/db';
import { recordAudit } from '../../services/audit.js';
import { assertUpdated } from '../../services/concurrency.js';
import { prisma } from '../../services/db.js';
import { enqueueJob } from '../../services/jobs.js';
import { notifyUsers, usersWithRole } from '../../services/notifications.js';
import { paymentGateway } from '../../services/payment-gateway.js';

const refundInclude = {
  transaction: true,
  customer: true,
  requestedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  attemptLog: { orderBy: { attemptNumber: 'asc' } },
} satisfies Prisma.RefundInclude;

const NON_REFUNDING_STATUSES = ['REJECTED', 'CANCELLED'] as const;

export async function listRefunds(query: RefundQuery) {
  const { page, pageSize, q, status, customerId, minAmountMinor, maxAmountMinor, from, to, sort, order } =
    query;
  const where: Prisma.RefundWhereInput = {
    ...(status ? { status } : {}),
    ...(customerId ? { customerId } : {}),
    ...(minAmountMinor !== undefined || maxAmountMinor !== undefined
      ? { amountMinor: { gte: minAmountMinor ?? 0, ...(maxAmountMinor !== undefined ? { lte: maxAmountMinor } : {}) } }
      : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { transaction: { reference: { contains: q, mode: 'insensitive' } } },
            { customer: { fullName: { contains: q, mode: 'insensitive' } } },
            { customer: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: {
        transaction: { select: { id: true, reference: true, amountMinor: true, paymentMethod: true } },
        customer: { select: { id: true, fullName: true, email: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.refund.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getRefund(id: string) {
  const refund = await prisma.refund.findUnique({ where: { id }, include: refundInclude });
  if (!refund) throw notFound('Refund');

  const [customerRefunds, customerTransactions, auditTrail, comments] = await Promise.all([
    prisma.refund.findMany({
      where: { customerId: refund.customerId, id: { not: refund.id } },
      select: { id: true, reference: true, amountMinor: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.transaction.findMany({
      where: { customerId: refund.customerId },
      select: { id: true, reference: true, amountMinor: true, createdAt: true, description: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.auditEvent.findMany({
      where: { entityType: 'REFUND', entityId: id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.comment.findMany({
      where: { entityType: 'REFUND', entityId: id },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return { ...refund, customerRefunds, customerTransactions, auditTrail, comments };
}

export async function refundMetrics() {
  const [byStatus, totals, pendingApproval, failed, last30] = await Promise.all([
    prisma.refund.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountMinor: true } }),
    prisma.refund.aggregate({ _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.refund.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.refund.count({ where: { status: 'FAILED' } }),
    prisma.refund.aggregate({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
  ]);

  const succeeded = byStatus
    .filter((r) => r.status === 'SUCCEEDED' || r.status === 'RECONCILED')
    .reduce((sum, r) => sum + (r._sum.amountMinor ?? 0), 0);

  return {
    byStatus: Object.fromEntries(
      byStatus.map((r) => [r.status, { count: r._count._all, amountMinor: r._sum.amountMinor ?? 0 }]),
    ),
    totalCount: totals._count._all,
    totalAmountMinor: totals._sum.amountMinor ?? 0,
    refundedAmountMinor: succeeded,
    pendingApproval,
    failed,
    last30Days: { count: last30._count._all, amountMinor: last30._sum.amountMinor ?? 0 },
  };
}

export interface CreateRefundResult {
  refund: Refund;
  idempotentReplay: boolean;
}

export async function createRefund(
  principal: Principal,
  input: CreateRefundInput,
): Promise<CreateRefundResult> {
  const transaction = await prisma.transaction.findUnique({ where: { id: input.transactionId } });
  if (!transaction) throw notFound('Transaction');

  const key = refundIdempotencyKey(transaction.id, input.idempotencyKey);
  const existing = await prisma.refund.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    // Idempotent replay: never create a second money movement for the same command.
    if (existing.amountMinor !== input.amountMinor) {
      throw new AppError(
        'DUPLICATE_REQUEST',
        'Idempotency key was already used with a different amount',
      );
    }
    return { refund: existing, idempotentReplay: true };
  }

  const priorRefunds = await prisma.refund.findMany({
    where: { transactionId: transaction.id, status: { notIn: [...NON_REFUNDING_STATUSES] } },
    select: { amountMinor: true },
  });
  const alreadyRefundedMinor = priorRefunds.reduce((sum, r) => sum + r.amountMinor, 0);

  const refundable = checkRefundable({
    transactionAmountMinor: transaction.amountMinor,
    alreadyRefundedMinor,
    requestedMinor: input.amountMinor,
    transactionSettled: transaction.settled,
  });
  if (!refundable.ok) throw new AppError('VALIDATION_ERROR', refundable.reason);

  if (input.kind === 'FULL' && input.amountMinor !== transaction.amountMinor - alreadyRefundedMinor) {
    throw new AppError('VALIDATION_ERROR', 'A FULL refund must cover the entire refundable remainder');
  }

  const needsApproval = requiresApproval(input.amountMinor);
  const status = needsApproval ? 'PENDING_APPROVAL' : 'APPROVED';

  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.refund.create({
      data: {
        reference: `RFD-${Date.now().toString(36).toUpperCase()}`,
        transactionId: transaction.id,
        customerId: transaction.customerId,
        amountMinor: input.amountMinor,
        currency: transaction.currency,
        kind: input.kind,
        status,
        reason: input.reason,
        idempotencyKey: key,
        requestedById: principal.id,
        approvedById: needsApproval ? null : principal.id,
      },
    });
    await recordAudit(tx, {
      action: 'refund.requested',
      entityType: 'REFUND',
      entityId: created.id,
      actorId: principal.id,
      summary: `Refund ${created.reference} requested for transaction ${transaction.reference}`,
      after: { status, amountMinor: created.amountMinor },
      metadata: { reason: input.reason, requiresApproval: needsApproval },
    });

    if (needsApproval) {
      await notifyUsers(tx, {
        userIds: await usersWithRole(tx, 'APPROVER'),
        type: 'REFUND_PENDING_APPROVAL',
        title: 'Refund awaiting approval',
        body: `${created.reference} for ${created.amountMinor} minor units needs a checker`,
        entityType: 'REFUND',
        entityId: created.id,
      });
    } else {
      await enqueueJob(tx, 'refund.execute', { refundId: created.id });
    }
    return created;
  });

  return { refund, idempotentReplay: false };
}

export async function decideRefund(
  refundId: string,
  principal: Principal,
  input: RefundDecisionInput,
) {
  const before = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!before) throw notFound('Refund');

  if (violatesMakerChecker(before.requestedById, principal.id)) {
    throw new AppError('MAKER_CHECKER_VIOLATION', 'You cannot approve a refund you requested');
  }
  if (requiresAdminApproval(before.amountMinor) && !principal.roles.includes('ADMIN')) {
    throw new AppError('FORBIDDEN', 'Refunds above the admin threshold require an ADMIN approver');
  }

  const to = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  assertRefundTransition(before.status, to);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refund.updateMany({
      where: { id: refundId, version: input.expectedVersion, status: before.status },
      data: {
        status: to,
        approvedById: principal.id,
        decisionReason: input.reason,
        version: { increment: 1 },
      },
    });
    assertUpdated(updated.count, 'Refund');

    await recordAudit(tx, {
      action: input.decision === 'APPROVE' ? 'refund.approved' : 'refund.rejected',
      entityType: 'REFUND',
      entityId: refundId,
      actorId: principal.id,
      summary: `Refund ${before.reference} ${to.toLowerCase()} by ${principal.name}`,
      before: { status: before.status },
      after: { status: to },
      metadata: { reason: input.reason },
    });

    await notifyUsers(tx, {
      userIds: [before.requestedById],
      type: 'REFUND_DECIDED',
      title: `Refund ${to.toLowerCase()}`,
      body: `${before.reference} was ${to.toLowerCase()} by ${principal.name}`,
      entityType: 'REFUND',
      entityId: refundId,
    });

    if (to === 'APPROVED') {
      await enqueueJob(tx, 'refund.execute', { refundId });
    }

    return tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: refundInclude });
  });
}

/**
 * Executes an approved refund against the mocked provider. Safe to call repeatedly:
 * only an APPROVED refund is claimed into PROCESSING, and the provider dedupes by key.
 */
export async function executeRefund(refundId: string, actorId: string | null = null) {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { transaction: true },
  });
  if (!refund) throw notFound('Refund');

  if (refund.status === 'SUCCEEDED' || refund.status === 'RECONCILED') {
    return { refund, executed: false, replayed: true };
  }
  assertRefundTransition(refund.status, 'PROCESSING');

  const claimed = await prisma.refund.updateMany({
    where: { id: refundId, status: refund.status, version: refund.version },
    data: { status: 'PROCESSING', version: { increment: 1 } },
  });
  assertUpdated(claimed.count, 'Refund');

  const attemptNumber = refund.attempts + 1;
  const result = await paymentGateway.refund({
    idempotencyKey: refund.idempotencyKey,
    transactionReference: refund.transaction.reference,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
  });

  const finished = await prisma.$transaction(async (tx) => {
    await tx.refundAttempt.create({
      data: {
        refundId,
        attemptNumber,
        succeeded: result.ok,
        providerReference: result.providerReference ?? null,
        error: result.error ?? null,
      },
    });

    const updated = await tx.refund.update({
      where: { id: refundId },
      data: {
        status: result.ok ? 'SUCCEEDED' : 'FAILED',
        attempts: attemptNumber,
        providerReference: result.providerReference ?? null,
        lastError: result.error ?? null,
        executedAt: result.ok ? new Date() : null,
        version: { increment: 1 },
      },
      include: refundInclude,
    });

    await recordAudit(tx, {
      action: result.ok ? 'refund.execution_succeeded' : 'refund.execution_failed',
      entityType: 'REFUND',
      entityId: refundId,
      actorId,
      summary: result.ok
        ? `Refund ${refund.reference} executed (attempt ${attemptNumber})`
        : `Refund ${refund.reference} failed on attempt ${attemptNumber}: ${result.error}`,
      before: { status: refund.status },
      after: { status: result.ok ? 'SUCCEEDED' : 'FAILED' },
      metadata: { attemptNumber, providerReference: result.providerReference, replayed: result.replayed },
    });

    if (!result.ok) {
      await notifyUsers(tx, {
        userIds: [refund.requestedById],
        type: 'REFUND_FAILED',
        title: 'Refund execution failed',
        body: `${refund.reference} failed: ${result.error}`,
        entityType: 'REFUND',
        entityId: refundId,
      });
    }
    return updated;
  });

  return { refund: finished, executed: true, replayed: result.replayed };
}

export async function retryRefund(refundId: string, principal: Principal, input: RefundRetryInput) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw notFound('Refund');
  if (refund.status !== 'FAILED') {
    throw new AppError('INVALID_TRANSITION', 'Only failed refunds can be retried');
  }
  if (refund.version !== input.expectedVersion) {
    throw new AppError('STALE_WRITE', 'Refund was modified by someone else. Reload and try again.');
  }
  if (!canRetry(refund.attempts)) {
    throw new AppError('CONFLICT', 'Maximum refund attempts reached; escalate to the payments team');
  }

  await recordAudit(prisma, {
    action: 'refund.retried',
    entityType: 'REFUND',
    entityId: refundId,
    actorId: principal.id,
    summary: `Refund ${refund.reference} retry requested by ${principal.name}`,
    metadata: { reason: input.reason, previousAttempts: refund.attempts },
  });

  return executeRefund(refundId, principal.id);
}

export async function reconcileRefund(
  refundId: string,
  principal: Principal,
  input: ReconcileInput,
) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw notFound('Refund');
  assertRefundTransition(refund.status, 'RECONCILED');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refund.updateMany({
      where: { id: refundId, status: 'SUCCEEDED', version: refund.version },
      data: {
        status: 'RECONCILED',
        reconciledAt: new Date(),
        providerReference: input.providerReference,
        version: { increment: 1 },
      },
    });
    assertUpdated(updated.count, 'Refund');
    await recordAudit(tx, {
      action: 'refund.reconciled',
      entityType: 'REFUND',
      entityId: refundId,
      actorId: principal.id,
      summary: `Refund ${refund.reference} reconciled against ${input.providerReference}`,
      before: { status: refund.status },
      after: { status: 'RECONCILED' },
      metadata: { note: input.note },
    });
    return tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: refundInclude });
  });
}

export async function addRefundComment(refundId: string, principal: Principal, body: string) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw notFound('Refund');
  return prisma.comment.create({
    data: { entityType: 'REFUND', entityId: refundId, authorId: principal.id, body },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
}

export async function listTransactions(q: string | undefined, customerId: string | undefined) {
  return prisma.transaction.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: 'insensitive' } },
              { customer: { fullName: { contains: q, mode: 'insensitive' } } },
              { customer: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, fullName: true, email: true } },
      refunds: { select: { amountMinor: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
}
