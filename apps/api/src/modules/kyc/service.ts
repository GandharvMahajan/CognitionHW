import {
  AppError,
  type AssignCaseInput,
  type CommentInput,
  type DocumentReviewInput,
  type EscalateInput,
  type KycCaseQuery,
  type KycDecisionInput,
  type KycStatus,
  type Principal,
  type RequestInfoInput,
  assertKycTransition,
  can,
  notFound,
  requiresSecondApproval,
  slaState,
} from '@fintech/domain';
import type { KycCase, Prisma, RiskLevel } from '@fintech/db';
import { recordAudit } from '../../services/audit.js';
import { assertUpdated } from '../../services/concurrency.js';
import { prisma } from '../../services/db.js';
import { notifyUsers, usersWithRole } from '../../services/notifications.js';

const caseInclude = {
  customer: true,
  assignee: { select: { id: true, name: true, email: true } },
  decidedBy: { select: { id: true, name: true, email: true } },
  documents: { orderBy: { createdAt: 'asc' } },
  infoRequests: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.KycCaseInclude;

export function decorateCase<T extends Pick<KycCase, 'slaDueAt' | 'status'>>(kycCase: T) {
  return {
    ...kycCase,
    slaState: slaState(kycCase.slaDueAt),
  };
}

export async function listCases(query: KycCaseQuery) {
  const { page, pageSize, q, status, risk, assigneeId, slaBreached, sort, order } = query;
  const where: Prisma.KycCaseWhereInput = {
    ...(status ? { status } : {}),
    ...(risk ? { riskLevel: risk } : {}),
    ...(assigneeId ? { assigneeId: assigneeId === 'unassigned' ? null : assigneeId } : {}),
    ...(slaBreached ? { slaDueAt: { lt: new Date() }, status: { notIn: ['APPROVED', 'REJECTED'] } } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { customer: { fullName: { contains: q, mode: 'insensitive' } } },
            { customer: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.kycCase.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, email: true, country: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.kycCase.count({ where }),
  ]);

  return { items: items.map(decorateCase), total, page, pageSize };
}

export async function getCase(id: string) {
  const kycCase = await prisma.kycCase.findUnique({ where: { id }, include: caseInclude });
  if (!kycCase) throw notFound('KYC case');

  const [comments, auditTrail, customerCases] = await Promise.all([
    prisma.comment.findMany({
      where: { entityType: 'KYC_CASE', entityId: id },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.auditEvent.findMany({
      where: { entityType: 'KYC_CASE', entityId: id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.kycCase.count({ where: { customerId: kycCase.customerId } }),
  ]);

  return { ...decorateCase(kycCase), comments, auditTrail, customerCaseCount: customerCases };
}

async function loadOpenCase(id: string): Promise<KycCase> {
  const kycCase = await prisma.kycCase.findUnique({ where: { id } });
  if (!kycCase) throw notFound('KYC case');
  return kycCase;
}

interface TransitionArgs {
  caseId: string;
  principal: Principal;
  to: KycStatus;
  expectedVersion: number;
}

async function transition(
  args: TransitionArgs,
  extraData: Prisma.KycCaseUncheckedUpdateManyInput,
  audit: { action: Parameters<typeof recordAudit>[1]['action']; summary: string; metadata?: Record<string, unknown> },
  after?: (tx: Prisma.TransactionClient, before: KycCase) => Promise<void>,
) {
  const before = await loadOpenCase(args.caseId);
  assertKycTransition(before.status, args.to);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.kycCase.updateMany({
      where: { id: args.caseId, version: args.expectedVersion, status: before.status },
      data: { ...extraData, status: args.to, version: { increment: 1 } },
    });
    assertUpdated(updated.count, 'KYC case');

    await recordAudit(tx, {
      action: audit.action,
      entityType: 'KYC_CASE',
      entityId: args.caseId,
      actorId: args.principal.id,
      summary: audit.summary,
      before: { status: before.status, version: before.version },
      after: { status: args.to, version: before.version + 1 },
      metadata: audit.metadata,
    });

    if (after) await after(tx, before);

    return tx.kycCase.findUniqueOrThrow({ where: { id: args.caseId }, include: caseInclude });
  });
}

export async function assignCase(caseId: string, principal: Principal, input: AssignCaseInput) {
  const before = await loadOpenCase(caseId);
  const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
  if (!assignee || !assignee.isActive) throw notFound('Assignee');
  const to: KycStatus = before.status === 'NEW' ? 'ASSIGNED' : before.status;
  assertKycTransition(before.status, to);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.kycCase.updateMany({
      where: { id: caseId, version: before.version },
      data: { assigneeId: assignee.id, status: to, version: { increment: 1 } },
    });
    assertUpdated(updated.count, 'KYC case');
    await recordAudit(tx, {
      action: 'kyc.case.assigned',
      entityType: 'KYC_CASE',
      entityId: caseId,
      actorId: principal.id,
      summary: `Case ${before.reference} assigned to ${assignee.name}`,
      before: { assigneeId: before.assigneeId, status: before.status },
      after: { assigneeId: assignee.id, status: to },
    });
    await notifyUsers(tx, {
      userIds: [assignee.id],
      type: 'KYC_ASSIGNED',
      title: 'New KYC case assigned',
      body: `Case ${before.reference} is now assigned to you`,
      entityType: 'KYC_CASE',
      entityId: caseId,
    });
    return tx.kycCase.findUniqueOrThrow({ where: { id: caseId }, include: caseInclude });
  });
}

export async function startReview(caseId: string, principal: Principal, expectedVersion: number) {
  const before = await loadOpenCase(caseId);
  return transition(
    { caseId, principal, to: 'IN_REVIEW', expectedVersion },
    { assigneeId: before.assigneeId ?? principal.id },
    { action: 'kyc.case.review_started', summary: `${principal.name} started reviewing ${before.reference}` },
  );
}

export async function requestInfo(caseId: string, principal: Principal, input: RequestInfoInput) {
  const before = await loadOpenCase(caseId);
  return transition(
    { caseId, principal, to: 'PENDING_INFO', expectedVersion: input.expectedVersion },
    {},
    {
      action: 'kyc.case.info_requested',
      summary: `Additional information requested on ${before.reference}`,
      metadata: { requestedDocuments: input.requestedDocuments, reason: input.reason },
    },
    async (tx) => {
      await tx.kycInfoRequest.create({
        data: {
          caseId,
          requestedDocuments: input.requestedDocuments,
          reason: input.reason,
          requestedById: principal.id,
        },
      });
    },
  );
}

export async function escalateCase(caseId: string, principal: Principal, input: EscalateInput) {
  const before = await loadOpenCase(caseId);
  return transition(
    { caseId, principal, to: 'ESCALATED', expectedVersion: input.expectedVersion },
    {},
    {
      action: 'kyc.case.escalated',
      summary: `Case ${before.reference} escalated by ${principal.name}`,
      metadata: { reason: input.reason },
    },
    async (tx) => {
      await notifyUsers(tx, {
        userIds: await usersWithRole(tx, 'APPROVER'),
        type: 'KYC_ESCALATED',
        title: 'KYC case escalated',
        body: `${before.reference} was escalated: ${input.reason}`,
        entityType: 'KYC_CASE',
        entityId: caseId,
      });
    },
  );
}

export async function decideCase(caseId: string, principal: Principal, input: KycDecisionInput) {
  const before = await loadOpenCase(caseId);
  if (!can(principal, 'kyc.case.decide')) {
    throw new AppError('FORBIDDEN', 'Missing required permission: kyc.case.decide');
  }
  // Four-eyes: on elevated risk the decision maker must differ from the reviewer.
  if (
    requiresSecondApproval(before.riskLevel as RiskLevel) &&
    before.assigneeId === principal.id &&
    !principal.roles.includes('ADMIN')
  ) {
    throw new AppError(
      'MAKER_CHECKER_VIOLATION',
      'High risk cases require a second approver who did not review the case',
    );
  }

  const to: KycStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  return transition(
    { caseId, principal, to, expectedVersion: input.expectedVersion },
    { decidedById: principal.id, decidedAt: new Date(), decisionReason: input.reason },
    {
      action: input.decision === 'APPROVE' ? 'kyc.case.approved' : 'kyc.case.rejected',
      summary: `Case ${before.reference} ${to.toLowerCase()} by ${principal.name}`,
      metadata: { reason: input.reason },
    },
    async (tx) => {
      if (before.assigneeId && before.assigneeId !== principal.id) {
        await notifyUsers(tx, {
          userIds: [before.assigneeId],
          type: 'KYC_DECIDED',
          title: `KYC case ${to.toLowerCase()}`,
          body: `${before.reference} was ${to.toLowerCase()} by ${principal.name}`,
          entityType: 'KYC_CASE',
          entityId: caseId,
        });
      }
    },
  );
}

export async function reviewDocument(
  caseId: string,
  documentId: string,
  principal: Principal,
  input: DocumentReviewInput,
) {
  const document = await prisma.kycDocument.findFirst({ where: { id: documentId, caseId } });
  if (!document) throw notFound('Document');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.kycDocument.update({
      where: { id: documentId },
      data: {
        status: input.verdict,
        reviewNote: input.note ?? null,
        reviewedById: principal.id,
        reviewedAt: new Date(),
      },
    });
    await recordAudit(tx, {
      action: 'kyc.document.reviewed',
      entityType: 'KYC_CASE',
      entityId: caseId,
      actorId: principal.id,
      summary: `Document ${document.type} marked ${input.verdict.toLowerCase()}`,
      before: { status: document.status },
      after: { status: input.verdict },
      metadata: { documentId, note: input.note },
    });
    return updated;
  });
}

export async function addComment(caseId: string, principal: Principal, input: CommentInput) {
  await loadOpenCase(caseId);
  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { entityType: 'KYC_CASE', entityId: caseId, authorId: principal.id, body: input.body },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    await recordAudit(tx, {
      action: 'kyc.comment.created',
      entityType: 'KYC_CASE',
      entityId: caseId,
      actorId: principal.id,
      summary: `${principal.name} commented on the case`,
      metadata: { commentId: comment.id },
    });
    return comment;
  });
}

export async function queueMetrics() {
  const [byStatus, byRisk, breached, unassigned] = await Promise.all([
    prisma.kycCase.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.kycCase.groupBy({ by: ['riskLevel'], _count: { _all: true } }),
    prisma.kycCase.count({
      where: { slaDueAt: { lt: new Date() }, status: { notIn: ['APPROVED', 'REJECTED'] } },
    }),
    prisma.kycCase.count({ where: { assigneeId: null } }),
  ]);
  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    byRisk: Object.fromEntries(byRisk.map((r) => [r.riskLevel, r._count._all])),
    slaBreached: breached,
    unassigned,
  };
}
