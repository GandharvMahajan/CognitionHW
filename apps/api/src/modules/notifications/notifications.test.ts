import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../services/db.js';
import { type TestUser, actor, as, resetDatabase, seedKycCase } from '../../test/helpers.js';

let approver: TestUser;
let reviewer: TestUser;

describe('notifications', () => {
  beforeEach(async () => {
    await resetDatabase();
    [approver, reviewer] = await Promise.all([actor(['APPROVER']), actor(['REVIEWER'])]);
  });

  it('delivers assignment notifications and marks them read', async () => {
    const kycCase = await seedKycCase({ riskScore: 10 });
    await as(approver).post(`/api/kyc/cases/${kycCase.id}/assign`).send({ assigneeId: reviewer.id });

    const inbox = await as(reviewer).get('/api/notifications');
    expect(inbox.body.unread).toBe(1);
    const notification = inbox.body.items[0];
    expect(notification.type).toBe('KYC_ASSIGNED');

    const read = await as(reviewer).post(`/api/notifications/${notification.id}/read`);
    expect(read.status).toBe(204);

    const after = await as(reviewer).get('/api/notifications');
    expect(after.body.unread).toBe(0);
  });

  it('does not leak notifications between users', async () => {
    const kycCase = await seedKycCase({ riskScore: 10 });
    await as(approver).post(`/api/kyc/cases/${kycCase.id}/assign`).send({ assigneeId: reviewer.id });

    const otherInbox = await as(approver).get('/api/notifications');
    expect(otherInbox.body.items).toHaveLength(0);

    const stolen = await prisma.notification.findFirstOrThrow({ where: { userId: reviewer.id } });
    const res = await as(approver).post(`/api/notifications/${stolen.id}/read`);
    expect(res.status).toBe(204);
    const untouched = await prisma.notification.findUniqueOrThrow({ where: { id: stolen.id } });
    expect(untouched.readAt).toBeNull();
  });
});
