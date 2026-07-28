import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../services/db.js';
import { runDueJobs } from '../../services/jobs.js';
import { type TestUser, actor, as, auditActions, resetDatabase, seedFlag } from '../../test/helpers.js';

const REASON = 'Ramping the new risk engine to the canary cohort';

let admin: TestUser;
let approver: TestUser;
let reviewer: TestUser;
let auditor: TestUser;

describe('feature flag admin', () => {
  beforeEach(async () => {
    await resetDatabase();
    [admin, approver, reviewer, auditor] = await Promise.all([
      actor(['ADMIN']),
      actor(['APPROVER']),
      actor(['REVIEWER']),
      actor(['AUDITOR']),
    ]);
  });

  describe('inventory', () => {
    it('lists flags by service and environment', async () => {
      await seedFlag({ environment: 'production' });
      await seedFlag({ environment: 'staging', enabled: true });
      const other = await prisma.featureFlag.create({
        data: { key: 'payments.instant', service: 'payments', environment: 'production', description: 'x' },
      });

      const all = await as(auditor).get('/api/flags');
      expect(all.body.total).toBe(3);
      expect(all.body.services).toEqual(expect.arrayContaining(['checkout', 'payments']));

      const prod = await as(auditor).get('/api/flags?environment=production');
      expect(prod.body.total).toBe(2);

      const enabled = await as(auditor).get('/api/flags?enabled=true');
      expect(enabled.body.total).toBe(1);

      const search = await as(auditor).get('/api/flags?q=payments.instant');
      expect(search.body.items[0].id).toBe(other.id);
    });

    it('lets admins create flags and denies everyone else', async () => {
      const payload = {
        key: 'console.new-nav',
        service: 'console',
        environment: 'development',
        description: 'New navigation shell',
        enabled: false,
        rolloutPercentage: 0,
      };
      const denied = await as(approver).post('/api/flags').send(payload);
      expect(denied.status).toBe(403);

      const created = await as(admin).post('/api/flags').send(payload);
      expect(created.status).toBe(201);

      const duplicate = await as(admin).post('/api/flags').send(payload);
      expect(duplicate.status).toBe(409);

      const invalidKey = await as(admin).post('/api/flags').send({ ...payload, key: 'Bad Key!' });
      expect(invalidKey.status).toBe(422);
    });
  });

  describe('non-production changes', () => {
    it('applies immediately without approval', async () => {
      const flag = await seedFlag({ environment: 'staging' });
      const res = await as(reviewer)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'TOGGLE', enabled: true, reason: REASON, expectedVersion: 0 });

      expect(res.status).toBe(201);
      expect(res.body.change.status).toBe('APPLIED');
      expect(res.body.flag).toMatchObject({ enabled: true, version: 1 });
      expect(await auditActions(flag.id)).toContain('flag.change_applied');
    });

    it('schedules a future change and applies it from the worker', async () => {
      const flag = await seedFlag({ environment: 'development' });
      const scheduledFor = new Date(Date.now() + 1_000).toISOString();
      const res = await as(reviewer)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'SCHEDULE', enabled: true, rolloutPercentage: 40, scheduledFor, reason: REASON, expectedVersion: 0 });

      expect(res.body.change.status).toBe('SCHEDULED');
      expect(res.body.flag.enabled).toBe(false);

      await runDueJobs(new Date(Date.now() + 5_000));

      const applied = await prisma.featureFlag.findUniqueOrThrow({ where: { id: flag.id } });
      expect(applied).toMatchObject({ enabled: true, rolloutPercentage: 40 });
      const change = await prisma.flagChange.findUniqueOrThrow({ where: { id: res.body.change.id } });
      expect(change.status).toBe('APPLIED');
    });
  });

  describe('production maker-checker', () => {
    async function pendingProdChange(requester = reviewer) {
      const flag = await seedFlag({ environment: 'production' });
      const res = await as(requester)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'ROLLOUT', rolloutPercentage: 25, reason: REASON, expectedVersion: 0 });
      return { flag, change: res.body.change as { id: string; status: string } };
    }

    it('queues production changes for approval instead of applying them', async () => {
      const { flag, change } = await pendingProdChange();
      expect(change.status).toBe('PENDING_APPROVAL');

      const stored = await prisma.featureFlag.findUniqueOrThrow({ where: { id: flag.id } });
      expect(stored).toMatchObject({ enabled: false, rolloutPercentage: 0, version: 0 });

      const notifications = await prisma.notification.findMany({ where: { userId: approver.id } });
      expect(notifications.map((n) => n.type)).toContain('FLAG_CHANGE_PENDING');

      const pending = await as(auditor).get('/api/flags/changes/pending');
      expect(pending.body.items).toHaveLength(1);
    });

    it('applies the change once a different approver signs off', async () => {
      const { flag, change } = await pendingProdChange();
      const approved = await as(approver)
        .post(`/api/flags/changes/${change.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Canary metrics look healthy for this ramp' });

      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('APPLIED');

      const stored = await prisma.featureFlag.findUniqueOrThrow({ where: { id: flag.id } });
      expect(stored).toMatchObject({ enabled: true, rolloutPercentage: 25, version: 1 });
      expect(await auditActions(flag.id)).toContain('flag.change_applied');
      expect(await auditActions(change.id)).toEqual(['flag.change_requested', 'flag.change_approved']);
    });

    it('blocks self-approval', async () => {
      const { change } = await pendingProdChange(approver);
      const res = await as(approver)
        .post(`/api/flags/changes/${change.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Trying to approve my own production change' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('rejects a change and leaves the flag untouched', async () => {
      const { flag, change } = await pendingProdChange();
      const res = await as(approver)
        .post(`/api/flags/changes/${change.id}/decision`)
        .send({ decision: 'REJECT', reason: 'Wait for the incident review to close first' });

      expect(res.body.status).toBe('REJECTED');
      const stored = await prisma.featureFlag.findUniqueOrThrow({ where: { id: flag.id } });
      expect(stored.enabled).toBe(false);

      const again = await as(approver)
        .post(`/api/flags/changes/${change.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Attempting to revive a rejected change' });
      expect(again.status).toBe(409);
    });

    it('denies reviewers approval rights and auditors change rights', async () => {
      const { flag, change } = await pendingProdChange();
      const reviewerApproval = await as(reviewer)
        .post(`/api/flags/changes/${change.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Reviewers must not approve production changes' });
      expect(reviewerApproval.status).toBe(403);

      const auditorChange = await as(auditor)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'TOGGLE', enabled: true, reason: REASON, expectedVersion: 0 });
      expect(auditorChange.status).toBe(403);
    });
  });

  describe('optimistic concurrency', () => {
    it('rejects a change based on a stale flag version', async () => {
      const flag = await seedFlag({ environment: 'staging' });
      await as(reviewer)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'TOGGLE', enabled: true, reason: REASON, expectedVersion: 0 });

      const stale = await as(reviewer)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'ROLLOUT', rolloutPercentage: 75, reason: REASON, expectedVersion: 0 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_WRITE');
    });

    it('rejects approval when the flag moved on since the request', async () => {
      const flag = await seedFlag({ environment: 'production' });
      const requested = await as(reviewer)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'ROLLOUT', rolloutPercentage: 25, reason: REASON, expectedVersion: 0 });

      // An out-of-band kill switch bumps the version the change was based on.
      await as(admin)
        .post(`/api/flags/${flag.id}/kill-switch`)
        .send({ reason: 'Incident 4212: disabling the risk engine now', expectedVersion: 0 });

      const res = await as(approver)
        .post(`/api/flags/changes/${requested.body.change.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'Approving a change that is no longer current' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STALE_WRITE');
    });
  });

  describe('kill switch and rollback', () => {
    it('requires an admin and a reason, then disables the flag', async () => {
      const flag = await seedFlag({ environment: 'production', enabled: true, rolloutPercentage: 100 });

      const noReason = await as(admin).post(`/api/flags/${flag.id}/kill-switch`).send({ reason: 'x', expectedVersion: 0 });
      expect(noReason.status).toBe(422);

      const denied = await as(approver)
        .post(`/api/flags/${flag.id}/kill-switch`)
        .send({ reason: 'Approvers cannot pull the emergency switch', expectedVersion: 0 });
      expect(denied.status).toBe(403);

      const killed = await as(admin)
        .post(`/api/flags/${flag.id}/kill-switch`)
        .send({ reason: 'Incident 4212: elevated error rate in checkout', expectedVersion: 0 });
      expect(killed.status).toBe(200);
      expect(killed.body).toMatchObject({ enabled: false, rolloutPercentage: 0, killSwitchEngaged: true });
      expect(await auditActions(flag.id)).toContain('flag.kill_switch_engaged');

      const blocked = await as(reviewer)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'TOGGLE', enabled: true, reason: 'Trying to re-enable during a kill switch', expectedVersion: 1 });
      expect(blocked.status).toBe(409);

      const released = await as(admin)
        .post(`/api/flags/${flag.id}/kill-switch/release`)
        .send({ reason: 'Incident 4212 resolved, releasing the kill switch' });
      expect(released.body.killSwitchEngaged).toBe(false);
    });

    it('rolls a flag back to the state before the last applied change', async () => {
      const flag = await seedFlag({ environment: 'staging', enabled: false, rolloutPercentage: 0 });
      await as(reviewer)
        .post(`/api/flags/${flag.id}/changes`)
        .send({ kind: 'ROLLOUT', rolloutPercentage: 60, reason: REASON, expectedVersion: 0 });

      const res = await as(approver)
        .post(`/api/flags/${flag.id}/rollback`)
        .send({ reason: 'Error rate spiked right after the ramp' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ enabled: false, rolloutPercentage: 0 });
      expect(await auditActions(flag.id)).toContain('flag.rolled_back');

      const reviewerRollback = await as(reviewer)
        .post(`/api/flags/${flag.id}/rollback`)
        .send({ reason: 'Reviewers are not allowed to roll back' });
      expect(reviewerRollback.status).toBe(403);
    });
  });
});
