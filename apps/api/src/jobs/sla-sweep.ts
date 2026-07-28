import { prisma } from '../services/db.js';
import { notifyUsers, usersWithRole } from '../services/notifications.js';

/**
 * Notifies approvers about KYC cases that have breached their SLA. Runs from the
 * background worker; safe to run repeatedly because notifications are deduped per case.
 */
export async function sweepSlaBreaches(now: Date = new Date()): Promise<number> {
  const breached = await prisma.kycCase.findMany({
    where: { slaDueAt: { lt: now }, status: { notIn: ['APPROVED', 'REJECTED'] } },
    select: { id: true, reference: true },
  });
  if (breached.length === 0) return 0;

  const existing = await prisma.notification.findMany({
    where: {
      type: 'KYC_SLA_BREACH',
      entityType: 'KYC_CASE',
      entityId: { in: breached.map((c) => c.id) },
    },
    select: { entityId: true },
  });
  const alreadyNotified = new Set(existing.map((n) => n.entityId));
  const approvers = await usersWithRole(prisma, 'APPROVER');

  let created = 0;
  for (const kycCase of breached) {
    if (alreadyNotified.has(kycCase.id)) continue;
    await notifyUsers(prisma, {
      userIds: approvers,
      type: 'KYC_SLA_BREACH',
      title: 'KYC SLA breached',
      body: `Case ${kycCase.reference} has passed its review SLA`,
      entityType: 'KYC_CASE',
      entityId: kycCase.id,
    });
    created++;
  }
  return created;
}
