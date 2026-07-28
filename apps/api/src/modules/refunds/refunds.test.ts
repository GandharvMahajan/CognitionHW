import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../services/db.js';
import { runDueJobs } from '../../services/jobs.js';
import { paymentGateway } from '../../services/payment-gateway.js';
import {
  type TestUser,
  actor,
  as,
  auditActions,
  resetDatabase,
  seedTransaction,
} from '../../test/helpers.js';

const REASON = 'Customer reported a duplicate charge on their statement';

let admin: TestUser;
let approver: TestUser;
let reviewer: TestUser;
let auditor: TestUser;

function refundPayload(transactionId: string, overrides: Record<string, unknown> = {}) {
  return {
    transactionId,
    amountMinor: 5_000,
    kind: 'PARTIAL',
    reason: REASON,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

describe('refunds dashboard', () => {
  beforeEach(async () => {
    await resetDatabase();
    [admin, approver, reviewer, auditor] = await Promise.all([
      actor(['ADMIN']),
      actor(['APPROVER']),
      actor(['REVIEWER']),
      actor(['AUDITOR']),
    ]);
  });

  describe('requesting', () => {
    it('auto-approves and executes small refunds through the worker', async () => {
      const txn = await seedTransaction(50_000);
      const created = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 5_000 }));

      expect(created.status).toBe(201);
      expect(created.body.refund.status).toBe('APPROVED');
      expect(created.body.idempotentReplay).toBe(false);

      const refundId = created.body.refund.id as string;
      expect(await prisma.job.count({ where: { type: 'refund.execute', status: 'PENDING' } })).toBe(1);

      await runDueJobs();

      const executed = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
      expect(executed.status).toBe('SUCCEEDED');
      expect(executed.providerReference).toBeTruthy();
      expect(executed.attempts).toBe(1);
      expect(await auditActions(refundId)).toEqual(['refund.requested', 'refund.execution_succeeded']);
    });

    it('routes refunds above the threshold to approval instead of executing', async () => {
      const txn = await seedTransaction(200_000);
      const created = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 150_000 }));

      expect(created.body.refund.status).toBe('PENDING_APPROVAL');
      expect(await prisma.job.count()).toBe(0);
      const notifications = await prisma.notification.findMany({ where: { userId: approver.id } });
      expect(notifications.map((n) => n.type)).toContain('REFUND_PENDING_APPROVAL');
    });

    it('treats a repeated idempotency key as a replay, not a second refund', async () => {
      const txn = await seedTransaction(50_000);
      const payload = refundPayload(txn.id, { amountMinor: 5_000 });

      const first = await as(reviewer).post('/api/refunds').send(payload);
      const second = await as(reviewer).post('/api/refunds').send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.idempotentReplay).toBe(true);
      expect(second.body.refund.id).toBe(first.body.refund.id);
      expect(await prisma.refund.count()).toBe(1);
    });

    it('rejects a reused idempotency key with a different amount', async () => {
      const txn = await seedTransaction(50_000);
      const payload = refundPayload(txn.id, { amountMinor: 5_000 });
      await as(reviewer).post('/api/refunds').send(payload);

      const conflict = await as(reviewer).post('/api/refunds').send({ ...payload, amountMinor: 6_000 });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('DUPLICATE_REQUEST');
    });

    it('never refunds more than the remaining transaction amount', async () => {
      const txn = await seedTransaction(10_000);
      await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 8_000 }));

      const tooMuch = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 5_000 }));
      expect(tooMuch.status).toBe(422);
      expect(tooMuch.body.error.message).toContain('exceeds refundable remainder');
    });

    it('rejects unsettled transactions and malformed amounts', async () => {
      const unsettled = await seedTransaction(10_000, false);
      const notSettled = await as(reviewer).post('/api/refunds').send(refundPayload(unsettled.id, { amountMinor: 1_000 }));
      expect(notSettled.status).toBe(422);

      const txn = await seedTransaction(10_000);
      const negative = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: -5 }));
      expect(negative.status).toBe(422);

      const fullMismatch = await as(reviewer)
        .post('/api/refunds')
        .send(refundPayload(txn.id, { amountMinor: 5_000, kind: 'FULL' }));
      expect(fullMismatch.status).toBe(422);
      expect(fullMismatch.body.error.message).toContain('FULL refund');
    });

    it('returns 404 for an unknown transaction', async () => {
      const res = await as(reviewer).post('/api/refunds').send(refundPayload('missing-txn'));
      expect(res.status).toBe(404);
    });
  });

  describe('approval', () => {
    async function pendingRefund(amountMinor = 150_000) {
      const txn = await seedTransaction(amountMinor * 2);
      const res = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor }));
      return res.body.refund as { id: string; version: number };
    }

    it('approves, executes and reconciles a refund', async () => {
      const refund = await pendingRefund();
      const approved = await as(approver)
        .post(`/api/refunds/${refund.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Verified duplicate charge in the ledger', expectedVersion: 0 });
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('APPROVED');

      await runDueJobs();
      const executed = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
      expect(executed.status).toBe('SUCCEEDED');

      const reconciled = await as(admin)
        .post(`/api/refunds/${refund.id}/reconcile`)
        .send({ providerReference: 'prov_settlement_001', note: 'Matched to settlement file' });
      expect(reconciled.status).toBe(200);
      expect(reconciled.body.status).toBe('RECONCILED');

      expect(await auditActions(refund.id)).toEqual([
        'refund.requested',
        'refund.approved',
        'refund.execution_succeeded',
        'refund.reconciled',
      ]);
    });

    it('blocks the requester from approving their own refund', async () => {
      const txn = await seedTransaction(400_000);
      const created = await as(approver).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 150_000 }));
      const res = await as(approver)
        .post(`/api/refunds/${created.body.refund.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Trying to self approve my own request', expectedVersion: 0 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('requires an admin above the admin approval threshold', async () => {
      const refund = await pendingRefund(600_000);
      const byApprover = await as(approver)
        .post(`/api/refunds/${refund.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Large refund approved by a normal approver', expectedVersion: 0 });
      expect(byApprover.status).toBe(403);

      const byAdmin = await as(admin)
        .post(`/api/refunds/${refund.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Large refund approved by an admin checker', expectedVersion: 0 });
      expect(byAdmin.status).toBe(200);
    });

    it('rejects stale approvals and double decisions', async () => {
      const refund = await pendingRefund();
      const stale = await as(approver)
        .post(`/api/refunds/${refund.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Working from a stale version number', expectedVersion: 7 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_WRITE');

      await as(approver)
        .post(`/api/refunds/${refund.id}/decision`)
        .send({ decision: 'REJECT', reason: 'Chargeback already filed with the network', expectedVersion: 0 });
      const again = await as(approver)
        .post(`/api/refunds/${refund.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Attempting to flip a rejected refund', expectedVersion: 1 });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('execution, retries and idempotency', () => {
    async function approvedRefund() {
      const txn = await seedTransaction(50_000);
      const created = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 5_000 }));
      return created.body.refund as { id: string; idempotencyKey: string };
    }

    it('retries a failed refund and succeeds on the second attempt', async () => {
      const refund = await approvedRefund();
      paymentGateway.failNext(refund.idempotencyKey, 1);

      await runDueJobs();
      const failed = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
      expect(failed.status).toBe('FAILED');
      expect(failed.attempts).toBe(1);
      expect(failed.lastError).toContain('PROVIDER_DECLINED');

      const retried = await as(approver)
        .post(`/api/refunds/${refund.id}/retry`)
        .send({ reason: 'Gateway incident resolved, retrying the payout', expectedVersion: failed.version });
      expect(retried.status).toBe(200);

      const settled = await prisma.refund.findUniqueOrThrow({
        where: { id: refund.id },
        include: { attemptLog: true },
      });
      expect(settled.status).toBe('SUCCEEDED');
      expect(settled.attemptLog).toHaveLength(2);
      expect(await auditActions(refund.id)).toContain('refund.retried');
    });

    it('stops retrying after the attempt cap', async () => {
      const refund = await approvedRefund();
      paymentGateway.failNext(refund.idempotencyKey, 5);
      await runDueJobs();

      for (let i = 0; i < 2; i++) {
        const current = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
        const res = await as(approver)
          .post(`/api/refunds/${refund.id}/retry`)
          .send({ reason: 'Retrying after another provider failure', expectedVersion: current.version });
        expect(res.status).toBe(200);
      }

      const exhausted = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
      expect(exhausted.attempts).toBe(3);
      const res = await as(approver)
        .post(`/api/refunds/${refund.id}/retry`)
        .send({ reason: 'One retry too many for this refund', expectedVersion: exhausted.version });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('Maximum refund attempts');
    });

    it('does not move money twice when execution is replayed', async () => {
      const refund = await approvedRefund();
      await runDueJobs();

      const replay = await as(admin).post(`/api/refunds/${refund.id}/execute`).send({});
      expect(replay.status).toBe(200);
      expect(replay.body.executed).toBe(false);
      expect(replay.body.replayed).toBe(true);

      const stored = await prisma.refund.findUniqueOrThrow({
        where: { id: refund.id },
        include: { attemptLog: true },
      });
      expect(stored.attempts).toBe(1);
      expect(stored.attemptLog).toHaveLength(1);
    });

    it('refuses to retry a refund that did not fail', async () => {
      const refund = await approvedRefund();
      await runDueJobs();
      const stored = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
      const res = await as(approver)
        .post(`/api/refunds/${refund.id}/retry`)
        .send({ reason: 'Trying to retry a successful refund', expectedVersion: stored.version });
      expect(res.status).toBe(409);
    });
  });

  describe('dashboard reads and authorization', () => {
    it('filters refunds and exposes metrics', async () => {
      const txn = await seedTransaction(80_000);
      await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 5_000 }));
      await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 40_000 }));

      const all = await as(auditor).get('/api/refunds');
      expect(all.body.total).toBe(2);

      const pending = await as(auditor).get('/api/refunds?status=PENDING_APPROVAL');
      expect(pending.body.total).toBe(1);

      const byAmount = await as(auditor).get('/api/refunds?minAmountMinor=10000');
      expect(byAmount.body.total).toBe(1);

      const search = await as(auditor).get(`/api/refunds?q=${txn.reference}`);
      expect(search.body.total).toBe(2);

      const metrics = await as(auditor).get('/api/refunds/metrics');
      expect(metrics.body.totalCount).toBe(2);
      expect(metrics.body.pendingApproval).toBe(1);
    });

    it('returns transaction and customer history on the detail view', async () => {
      const txn = await seedTransaction(50_000);
      const created = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 5_000 }));
      const detail = await as(reviewer).get(`/api/refunds/${created.body.refund.id}`);

      expect(detail.status).toBe(200);
      expect(detail.body.transaction.reference).toBe(txn.reference);
      expect(detail.body.customerTransactions).toHaveLength(1);
      expect(detail.body.auditTrail[0].action).toBe('refund.requested');
    });

    it('enforces permissions across refund commands', async () => {
      const txn = await seedTransaction(50_000);
      const created = await as(reviewer).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 5_000 }));
      const refundId = created.body.refund.id as string;

      const auditorRequest = await as(auditor).post('/api/refunds').send(refundPayload(txn.id, { amountMinor: 1_000 }));
      expect(auditorRequest.status).toBe(403);

      const reviewerApprove = await as(reviewer)
        .post(`/api/refunds/${refundId}/decision`)
        .send({ decision: 'APPROVE', reason: 'Reviewers must not approve refunds', expectedVersion: 0 });
      expect(reviewerApprove.status).toBe(403);

      const approverExecute = await as(approver).post(`/api/refunds/${refundId}/execute`).send({});
      expect(approverExecute.status).toBe(403);

      const approverReconcile = await as(approver)
        .post(`/api/refunds/${refundId}/reconcile`)
        .send({ providerReference: 'prov_1' });
      expect(approverReconcile.status).toBe(403);
    });
  });
});
