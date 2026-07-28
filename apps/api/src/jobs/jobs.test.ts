import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../services/db.js';
import { enqueueJob, registerJobHandler, runDueJobs } from '../services/jobs.js';
import { type TestUser, actor, resetDatabase, seedKycCase } from '../test/helpers.js';
import { registerJobHandlers } from './index.js';
import { sweepSlaBreaches } from './sla-sweep.js';

let approver: TestUser;

describe('background jobs', () => {
  beforeEach(async () => {
    await resetDatabase();
    registerJobHandlers();
    approver = await actor(['APPROVER']);
  });

  it('does not run jobs scheduled for the future', async () => {
    await enqueueJob(prisma, 'kyc.sla_breach_sweep', {}, new Date(Date.now() + 60_000));
    expect(await runDueJobs()).toBe(0);
    const job = await prisma.job.findFirstOrThrow();
    expect(job.status).toBe('PENDING');
  });

  it('retries a failing job with backoff and gives up after the cap', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    registerJobHandler('refund.execute', handler);
    await enqueueJob(prisma, 'refund.execute', { refundId: 'nope' });

    await runDueJobs();
    let job = await prisma.job.findFirstOrThrow();
    expect(job.status).toBe('PENDING');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toContain('boom');
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());

    for (let i = 0; i < 4; i++) {
      await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
      await runDueJobs();
      job = await prisma.job.findFirstOrThrow();
    }
    expect(job.status).toBe('FAILED');
    expect(handler).toHaveBeenCalledTimes(5);

    // Restore the real handler for the rest of the suite.
    registerJobHandler('refund.execute', async () => undefined);
  });

  it('notifies approvers once per SLA-breached case', async () => {
    const kycCase = await seedKycCase({ riskScore: 95 });
    await prisma.kycCase.update({
      where: { id: kycCase.id },
      data: { slaDueAt: new Date(Date.now() - 3600_000) },
    });

    expect(await sweepSlaBreaches()).toBe(1);
    expect(await sweepSlaBreaches()).toBe(0);

    const notifications = await prisma.notification.findMany({
      where: { userId: approver.id, type: 'KYC_SLA_BREACH' },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].entityId).toBe(kycCase.id);
  });

  it('ignores decided cases when sweeping SLAs', async () => {
    const kycCase = await seedKycCase({ riskScore: 95 });
    await prisma.kycCase.update({
      where: { id: kycCase.id },
      data: { slaDueAt: new Date(Date.now() - 3600_000), status: 'APPROVED' },
    });
    expect(await sweepSlaBreaches()).toBe(0);
  });
});
