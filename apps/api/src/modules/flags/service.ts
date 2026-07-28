import {
  AppError,
  type CreateFlagInput,
  type FlagChangeDecisionInput,
  type FlagChangeRequestInput,
  type FlagQuery,
  type KillSwitchInput,
  type Principal,
  type RollbackInput,
  assertFlagChangeTransition,
  assertFreshVersion,
  flagRequiresApproval,
  notFound,
  violatesMakerChecker,
} from '@fintech/domain';
import type { FeatureFlag, FlagChange, Prisma } from '@fintech/db';
import { recordAudit } from '../../services/audit.js';
import { assertUpdated } from '../../services/concurrency.js';
import { prisma } from '../../services/db.js';
import { enqueueJob } from '../../services/jobs.js';
import { notifyUsers, usersWithRole } from '../../services/notifications.js';

interface FlagState {
  enabled: boolean;
  rolloutPercentage: number;
}

function stateOf(flag: FeatureFlag): FlagState {
  return { enabled: flag.enabled, rolloutPercentage: flag.rolloutPercentage };
}

function stateJson(state: FlagState): Prisma.InputJsonObject {
  return { enabled: state.enabled, rolloutPercentage: state.rolloutPercentage };
}

function targetState(flag: FeatureFlag, input: FlagChangeRequestInput): FlagState {
  switch (input.kind) {
    case 'TOGGLE':
      return { enabled: input.enabled ?? flag.enabled, rolloutPercentage: flag.rolloutPercentage };
    case 'ROLLOUT':
      return {
        enabled: flag.enabled || (input.rolloutPercentage ?? 0) > 0,
        rolloutPercentage: input.rolloutPercentage ?? flag.rolloutPercentage,
      };
    case 'SCHEDULE':
      return {
        enabled: input.enabled ?? true,
        rolloutPercentage: input.rolloutPercentage ?? flag.rolloutPercentage,
      };
  }
}

function asState(value: Prisma.JsonValue): FlagState {
  const raw = value as { enabled?: unknown; rolloutPercentage?: unknown } | null;
  return {
    enabled: Boolean(raw?.enabled),
    rolloutPercentage: typeof raw?.rolloutPercentage === 'number' ? raw.rolloutPercentage : 0,
  };
}

export async function listFlags(query: FlagQuery) {
  const { page, pageSize, q, service, environment, enabled } = query;
  const where: Prisma.FeatureFlagWhereInput = {
    ...(service ? { service } : {}),
    ...(environment ? { environment } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(q
      ? {
          OR: [
            { key: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { service: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total, services] = await Promise.all([
    prisma.featureFlag.findMany({
      where,
      orderBy: [{ service: 'asc' }, { key: 'asc' }, { environment: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.featureFlag.count({ where }),
    prisma.featureFlag.findMany({ distinct: ['service'], select: { service: true }, orderBy: { service: 'asc' } }),
  ]);
  return { items, total, page, pageSize, services: services.map((s) => s.service) };
}

export async function getFlag(id: string) {
  const flag = await prisma.featureFlag.findUnique({
    where: { id },
    include: {
      changes: {
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!flag) throw notFound('Feature flag');
  const auditTrail = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { entityType: 'FEATURE_FLAG', entityId: id },
        { entityType: 'FLAG_CHANGE', entityId: { in: flag.changes.map((c) => c.id) } },
      ],
    },
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return { ...flag, auditTrail };
}

export async function createFlag(principal: Principal, input: CreateFlagInput) {
  const existing = await prisma.featureFlag.findFirst({
    where: { key: input.key, environment: input.environment },
  });
  if (existing) throw new AppError('CONFLICT', 'A flag with this key already exists in this environment');

  return prisma.$transaction(async (tx) => {
    const flag = await tx.featureFlag.create({ data: input });
    await recordAudit(tx, {
      action: 'flag.created',
      entityType: 'FEATURE_FLAG',
      entityId: flag.id,
      actorId: principal.id,
      summary: `Flag ${flag.key} created in ${flag.environment}`,
      after: stateOf(flag),
    });
    return flag;
  });
}

async function applyStateToFlag(
  tx: Prisma.TransactionClient,
  flag: FeatureFlag,
  state: FlagState,
  extra: Partial<Prisma.FeatureFlagUpdateManyMutationInput> = {},
) {
  const updated = await tx.featureFlag.updateMany({
    where: { id: flag.id, version: flag.version },
    data: {
      enabled: state.enabled,
      rolloutPercentage: state.rolloutPercentage,
      version: { increment: 1 },
      ...extra,
    },
  });
  assertUpdated(updated.count, 'Feature flag');
}

export async function requestFlagChange(
  flagId: string,
  principal: Principal,
  input: FlagChangeRequestInput,
) {
  const flag = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw notFound('Feature flag');
  if (flag.killSwitchEngaged) {
    throw new AppError('CONFLICT', 'Flag is under an active kill switch and must be re-enabled by an admin');
  }
  assertFreshVersion(flag.version, input.expectedVersion);

  const after = targetState(flag, input);
  const needsApproval = flagRequiresApproval(flag.environment, input.kind);
  const scheduled = Boolean(input.scheduledFor) && !needsApproval;
  const status = needsApproval ? 'PENDING_APPROVAL' : scheduled ? 'SCHEDULED' : 'APPLIED';

  return prisma.$transaction(async (tx) => {
    const change = await tx.flagChange.create({
      data: {
        flagId,
        kind: input.kind,
        status,
        reason: input.reason,
        beforeState: stateJson(stateOf(flag)),
        afterState: stateJson(after),
        expectedVersion: input.expectedVersion,
        requestedById: principal.id,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        appliedAt: status === 'APPLIED' ? new Date() : null,
      },
    });

    await recordAudit(tx, {
      action: 'flag.change_requested',
      entityType: 'FLAG_CHANGE',
      entityId: change.id,
      actorId: principal.id,
      summary: `${input.kind} change requested for ${flag.key} in ${flag.environment}`,
      before: stateOf(flag),
      after,
      metadata: { reason: input.reason, flagId, requiresApproval: needsApproval },
    });

    if (needsApproval) {
      await notifyUsers(tx, {
        userIds: await usersWithRole(tx, 'APPROVER'),
        type: 'FLAG_CHANGE_PENDING',
        title: 'Production flag change awaiting approval',
        body: `${flag.key} (${input.kind}) requested by ${principal.name}`,
        entityType: 'FLAG_CHANGE',
        entityId: change.id,
      });
    } else if (scheduled) {
      await enqueueJob(tx, 'flag.apply_scheduled_change', { changeId: change.id }, new Date(input.scheduledFor!));
    } else {
      await applyStateToFlag(tx, flag, after);
      await recordAudit(tx, {
        action: 'flag.change_applied',
        entityType: 'FEATURE_FLAG',
        entityId: flagId,
        actorId: principal.id,
        summary: `${flag.key} updated in ${flag.environment}`,
        before: stateOf(flag),
        after,
        metadata: { changeId: change.id },
      });
    }

    return {
      change,
      flag: await tx.featureFlag.findUniqueOrThrow({ where: { id: flagId } }),
    };
  });
}

export async function decideFlagChange(
  changeId: string,
  principal: Principal,
  input: FlagChangeDecisionInput,
) {
  const change = await prisma.flagChange.findUnique({ where: { id: changeId }, include: { flag: true } });
  if (!change) throw notFound('Flag change');
  if (violatesMakerChecker(change.requestedById, principal.id)) {
    throw new AppError('MAKER_CHECKER_VIOLATION', 'You cannot approve a change you requested');
  }
  const to = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  assertFlagChangeTransition(change.status, to);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.flagChange.updateMany({
      where: { id: changeId, status: change.status },
      data: { status: to, approvedById: principal.id, decisionReason: input.reason },
    });
    assertUpdated(claimed.count, 'Flag change');

    await recordAudit(tx, {
      action: input.decision === 'APPROVE' ? 'flag.change_approved' : 'flag.change_rejected',
      entityType: 'FLAG_CHANGE',
      entityId: changeId,
      actorId: principal.id,
      summary: `Change for ${change.flag.key} ${to.toLowerCase()} by ${principal.name}`,
      before: { status: change.status },
      after: { status: to },
      metadata: { reason: input.reason },
    });

    await notifyUsers(tx, {
      userIds: [change.requestedById],
      type: 'FLAG_CHANGE_DECIDED',
      title: `Flag change ${to.toLowerCase()}`,
      body: `${change.flag.key} change was ${to.toLowerCase()} by ${principal.name}`,
      entityType: 'FLAG_CHANGE',
      entityId: changeId,
    });

    if (to === 'APPROVED') {
      if (change.scheduledFor && change.scheduledFor > new Date()) {
        await tx.flagChange.update({ where: { id: changeId }, data: { status: 'SCHEDULED' } });
        await enqueueJob(tx, 'flag.apply_scheduled_change', { changeId }, change.scheduledFor);
      } else {
        // Optimistic concurrency: the flag must still be on the version the maker saw.
        assertFreshVersion(change.flag.version, change.expectedVersion);
        await applyStateToFlag(tx, change.flag, asState(change.afterState));
        await tx.flagChange.update({
          where: { id: changeId },
          data: { status: 'APPLIED', appliedAt: new Date() },
        });
        await recordAudit(tx, {
          action: 'flag.change_applied',
          entityType: 'FEATURE_FLAG',
          entityId: change.flagId,
          actorId: principal.id,
          summary: `${change.flag.key} updated in ${change.flag.environment}`,
          before: asState(change.beforeState),
          after: asState(change.afterState),
          metadata: { changeId },
        });
      }
    }

    return tx.flagChange.findUniqueOrThrow({ where: { id: changeId }, include: { flag: true } });
  });
}

/** Worker entrypoint for scheduled changes. */
export async function applyScheduledFlagChange(changeId: string): Promise<FlagChange> {
  const change = await prisma.flagChange.findUnique({ where: { id: changeId }, include: { flag: true } });
  if (!change) throw notFound('Flag change');
  if (change.status === 'APPLIED') return change;
  assertFlagChangeTransition(change.status, 'APPLIED');

  return prisma.$transaction(async (tx) => {
    assertFreshVersion(change.flag.version, change.expectedVersion);
    await applyStateToFlag(tx, change.flag, asState(change.afterState));
    const applied = await tx.flagChange.update({
      where: { id: changeId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });
    await recordAudit(tx, {
      action: 'flag.change_applied',
      entityType: 'FEATURE_FLAG',
      entityId: change.flagId,
      actorId: null,
      summary: `Scheduled change applied to ${change.flag.key} in ${change.flag.environment}`,
      before: asState(change.beforeState),
      after: asState(change.afterState),
      metadata: { changeId, scheduled: true },
    });
    return applied;
  });
}

export async function rollbackFlag(flagId: string, principal: Principal, input: RollbackInput) {
  const flag = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw notFound('Feature flag');

  const target = input.targetChangeId
    ? await prisma.flagChange.findFirst({ where: { id: input.targetChangeId, flagId, status: 'APPLIED' } })
    : await prisma.flagChange.findFirst({
        where: { flagId, status: 'APPLIED' },
        orderBy: { appliedAt: 'desc' },
      });
  if (!target) throw new AppError('CONFLICT', 'No applied change is available to roll back');

  const restore = asState(target.beforeState);

  return prisma.$transaction(async (tx) => {
    const change = await tx.flagChange.create({
      data: {
        flagId,
        kind: 'ROLLBACK',
        status: 'APPLIED',
        reason: input.reason,
        beforeState: stateJson(stateOf(flag)),
        afterState: stateJson(restore),
        expectedVersion: flag.version,
        requestedById: principal.id,
        approvedById: principal.id,
        appliedAt: new Date(),
      },
    });
    await applyStateToFlag(tx, flag, restore);
    await recordAudit(tx, {
      action: 'flag.rolled_back',
      entityType: 'FEATURE_FLAG',
      entityId: flagId,
      actorId: principal.id,
      summary: `${flag.key} rolled back to the state before change ${target.id}`,
      before: stateOf(flag),
      after: restore,
      metadata: { reason: input.reason, rolledBackChangeId: target.id, changeId: change.id },
    });
    return tx.featureFlag.findUniqueOrThrow({ where: { id: flagId } });
  });
}

/** Emergency path: disables the flag immediately, bypassing approval but always audited. */
export async function engageKillSwitch(flagId: string, principal: Principal, input: KillSwitchInput) {
  const flag = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw notFound('Feature flag');
  assertFreshVersion(flag.version, input.expectedVersion);

  return prisma.$transaction(async (tx) => {
    const change = await tx.flagChange.create({
      data: {
        flagId,
        kind: 'KILL_SWITCH',
        status: 'APPLIED',
        reason: input.reason,
        beforeState: stateJson(stateOf(flag)),
        afterState: { enabled: false, rolloutPercentage: 0 },
        expectedVersion: flag.version,
        requestedById: principal.id,
        approvedById: principal.id,
        appliedAt: new Date(),
      },
    });
    await applyStateToFlag(
      tx,
      flag,
      { enabled: false, rolloutPercentage: 0 },
      { killSwitchEngaged: true },
    );
    await recordAudit(tx, {
      action: 'flag.kill_switch_engaged',
      entityType: 'FEATURE_FLAG',
      entityId: flagId,
      actorId: principal.id,
      summary: `Kill switch engaged on ${flag.key} in ${flag.environment}`,
      before: stateOf(flag),
      after: { enabled: false, rolloutPercentage: 0 },
      metadata: { reason: input.reason, changeId: change.id },
    });
    await notifyUsers(tx, {
      userIds: [...(await usersWithRole(tx, 'APPROVER')), ...(await usersWithRole(tx, 'ADMIN'))],
      type: 'FLAG_KILL_SWITCH',
      title: 'Kill switch engaged',
      body: `${flag.key} (${flag.environment}) was disabled by ${principal.name}: ${input.reason}`,
      entityType: 'FEATURE_FLAG',
      entityId: flagId,
    });
    return tx.featureFlag.findUniqueOrThrow({ where: { id: flagId } });
  });
}

export async function releaseKillSwitch(flagId: string, principal: Principal, reason: string) {
  const flag = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw notFound('Feature flag');
  if (!flag.killSwitchEngaged) throw new AppError('CONFLICT', 'No kill switch is engaged on this flag');

  return prisma.$transaction(async (tx) => {
    await tx.featureFlag.update({
      where: { id: flagId },
      data: { killSwitchEngaged: false, version: { increment: 1 } },
    });
    await recordAudit(tx, {
      action: 'flag.change_applied',
      entityType: 'FEATURE_FLAG',
      entityId: flagId,
      actorId: principal.id,
      summary: `Kill switch released on ${flag.key}`,
      metadata: { reason },
    });
    return tx.featureFlag.findUniqueOrThrow({ where: { id: flagId } });
  });
}

export async function listPendingChanges() {
  return prisma.flagChange.findMany({
    where: { status: { in: ['PENDING_APPROVAL', 'SCHEDULED'] } },
    include: {
      flag: true,
      requestedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
