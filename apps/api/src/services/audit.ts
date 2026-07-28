import type { AuditEventInput } from '@fintech/domain';
import type { Prisma } from '@fintech/db';
import type { Db } from './db.js';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Writes an immutable audit event. Always call inside the same transaction as the
 * state change so an audited action can never be persisted without its trail.
 */
export async function recordAudit(db: Db, input: AuditEventInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId,
      summary: input.summary,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: toJson(input.metadata),
    },
  });
}
