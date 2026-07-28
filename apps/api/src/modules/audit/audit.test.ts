import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../services/db.js';
import { type TestUser, actor, as, resetDatabase, seedKycCase } from '../../test/helpers.js';

let approver: TestUser;
let reviewer: TestUser;
let auditor: TestUser;

describe('audit trail', () => {
  beforeEach(async () => {
    await resetDatabase();
    [approver, reviewer, auditor] = await Promise.all([
      actor(['APPROVER']),
      actor(['REVIEWER']),
      actor(['AUDITOR']),
    ]);
  });

  it('lets auditors read the stream and filter it', async () => {
    const kycCase = await seedKycCase({ riskScore: 10 });
    await as(reviewer).post(`/api/kyc/cases/${kycCase.id}/assign`).send({ assigneeId: reviewer.id });

    const res = await as(auditor).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.items[0]).toHaveProperty('actor');

    const filtered = await as(auditor).get(`/api/audit?entityType=KYC_CASE&entityId=${kycCase.id}`);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].action).toBe('kyc.case.assigned');

    const byAction = await as(auditor).get('/api/audit?action=auth.login');
    expect(byAction.body.total).toBeGreaterThan(0);
  });

  it('denies reviewers access to the audit stream', async () => {
    const res = await as(reviewer).get('/api/audit');
    expect(res.status).toBe(403);
  });

  it('allows approvers to read audit history', async () => {
    const res = await as(approver).get('/api/audit');
    expect(res.status).toBe(200);
  });

  it('stores before/after snapshots for state changes', async () => {
    const kycCase = await seedKycCase({ riskScore: 10, status: 'IN_REVIEW', assigneeId: reviewer.id });
    await as(approver)
      .post(`/api/kyc/cases/${kycCase.id}/decision`)
      .send({ decision: 'APPROVE', reason: 'All documents verified against the registry', expectedVersion: 0 });

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: kycCase.id, action: 'kyc.case.approved' },
    });
    expect(event.before).toMatchObject({ status: 'IN_REVIEW' });
    expect(event.after).toMatchObject({ status: 'APPROVED' });
    expect(event.actorId).toBe(approver.id);
  });

  it('is immutable at the database level', async () => {
    const kycCase = await seedKycCase({ riskScore: 10 });
    await as(reviewer).post(`/api/kyc/cases/${kycCase.id}/assign`).send({ assigneeId: reviewer.id });
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: kycCase.id } });

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET summary = 'tampered' WHERE id = $1`, event.id),
    ).rejects.toThrow(/immutable/i);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "AuditEvent" WHERE id = $1`, event.id),
    ).rejects.toThrow(/immutable/i);

    const unchanged = await prisma.auditEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(unchanged.summary).toBe(event.summary);
  });
});
