import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../services/db.js';
import {
  type TestUser,
  actor,
  as,
  auditActions,
  resetDatabase,
  seedKycCase,
} from '../../test/helpers.js';

const REASON = 'Documents verified against the government registry';

let admin: TestUser;
let approver: TestUser;
let reviewer: TestUser;
let auditor: TestUser;

async function caseInReview(riskScore = 10, assigneeId?: string) {
  const kycCase = await seedKycCase({ riskScore, status: 'IN_REVIEW', assigneeId: assigneeId ?? reviewer.id });
  return kycCase;
}

describe('kyc review queue', () => {
  beforeEach(async () => {
    await resetDatabase();
    [admin, approver, reviewer, auditor] = await Promise.all([
      actor(['ADMIN']),
      actor(['APPROVER']),
      actor(['REVIEWER']),
      actor(['AUDITOR']),
    ]);
  });

  describe('queue', () => {
    it('searches, filters and paginates the queue with SLA state', async () => {
      await seedKycCase({ riskScore: 90 });
      await seedKycCase({ riskScore: 5 });
      const named = await seedKycCase({ riskScore: 50 });
      await prisma.customer.update({ where: { id: named.customerId }, data: { fullName: 'Zelda Findme' } });

      const all = await as(reviewer).get('/api/kyc/cases?pageSize=2');
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(3);
      expect(all.body.items).toHaveLength(2);
      expect(all.body.items[0].slaState).toMatch(/ON_TRACK|AT_RISK|BREACHED/);

      const critical = await as(reviewer).get('/api/kyc/cases?risk=CRITICAL');
      expect(critical.body.total).toBe(1);

      const search = await as(reviewer).get('/api/kyc/cases?q=Findme');
      expect(search.body.total).toBe(1);
      expect(search.body.items[0].id).toBe(named.id);

      const unassigned = await as(reviewer).get('/api/kyc/cases?assigneeId=unassigned');
      expect(unassigned.body.total).toBe(3);
    });

    it('exposes queue metrics', async () => {
      await seedKycCase({ riskScore: 90 });
      await seedKycCase({ riskScore: 5, status: 'IN_REVIEW', assigneeId: reviewer.id });
      const res = await as(approver).get('/api/kyc/metrics');
      expect(res.status).toBe(200);
      expect(res.body.byStatus.NEW).toBe(1);
      expect(res.body.byStatus.IN_REVIEW).toBe(1);
      expect(res.body.unassigned).toBe(1);
    });
  });

  describe('happy path', () => {
    it('walks assign -> review -> approve and audits every step', async () => {
      const kycCase = await seedKycCase({ riskScore: 10 });

      const assigned = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/assign`)
        .send({ assigneeId: reviewer.id });
      expect(assigned.status).toBe(200);
      expect(assigned.body).toMatchObject({ status: 'ASSIGNED', assigneeId: reviewer.id, version: 1 });

      const started = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/start-review`)
        .send({ expectedVersion: 1 });
      expect(started.body.status).toBe('IN_REVIEW');

      const doc = assigned.body.documents?.[0] ?? (await prisma.kycDocument.findFirstOrThrow({ where: { caseId: kycCase.id } }));
      const reviewed = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/documents/${doc.id}/review`)
        .send({ verdict: 'ACCEPTED', note: 'Matches registry record' });
      expect(reviewed.body.status).toBe('ACCEPTED');

      const decided = await as(approver)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'APPROVE', reason: REASON, expectedVersion: 2 });
      expect(decided.status).toBe(200);
      expect(decided.body).toMatchObject({ status: 'APPROVED', decidedById: approver.id });
      expect(decided.body.decisionReason).toBe(REASON);

      expect(await auditActions(kycCase.id)).toEqual([
        'kyc.case.assigned',
        'kyc.case.review_started',
        'kyc.document.reviewed',
        'kyc.case.approved',
      ]);
    });

    it('supports request-info, escalation and comments', async () => {
      const kycCase = await caseInReview();

      const info = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/request-info`)
        .send({
          reason: 'Proof of address is older than 90 days',
          requestedDocuments: ['PROOF_OF_ADDRESS'],
          expectedVersion: 0,
        });
      expect(info.status).toBe(200);
      expect(info.body.status).toBe('PENDING_INFO');
      expect(info.body.infoRequests).toHaveLength(1);

      const resumed = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/start-review`)
        .send({ expectedVersion: 1 });
      expect(resumed.body.status).toBe('IN_REVIEW');

      const escalated = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/escalate`)
        .send({ reason: 'Possible sanctions list match needs approver review', expectedVersion: 2 });
      expect(escalated.body.status).toBe('ESCALATED');

      const comment = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/comments`)
        .send({ body: 'Called the customer to confirm the address' });
      expect(comment.status).toBe(201);

      const detail = await as(auditor).get(`/api/kyc/cases/${kycCase.id}`);
      expect(detail.body.comments).toHaveLength(1);
      expect(detail.body.auditTrail.map((e: { action: string }) => e.action)).toEqual(
        expect.arrayContaining(['kyc.case.info_requested', 'kyc.case.escalated', 'kyc.comment.created']),
      );

      const notifications = await prisma.notification.findMany({ where: { userId: approver.id } });
      expect(notifications.map((n) => n.type)).toContain('KYC_ESCALATED');
    });
  });

  describe('validation and conflicts', () => {
    it('rejects a decision reason that is too short', async () => {
      const kycCase = await caseInReview();
      const res = await as(approver)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'APPROVE', reason: 'ok', expectedVersion: 0 });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a stale expectedVersion', async () => {
      const kycCase = await caseInReview();
      const first = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/request-info`)
        .send({ reason: 'First writer wins this race', requestedDocuments: ['SELFIE'], expectedVersion: 0 });
      expect(first.status).toBe(200);

      // PENDING_INFO -> ESCALATED is a legal transition, so only the version guard can reject this.
      const stale = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/escalate`)
        .send({ reason: 'Second writer is working from a stale view', expectedVersion: 0 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_WRITE');
    });

    it('rejects transitions that the state machine forbids', async () => {
      const kycCase = await seedKycCase({ riskScore: 10 });
      const res = await as(approver)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'APPROVE', reason: REASON, expectedVersion: 0 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('does not allow deciding a case twice', async () => {
      const kycCase = await caseInReview();
      const first = await as(approver)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'APPROVE', reason: REASON, expectedVersion: 0 });
      expect(first.status).toBe(200);

      const second = await as(approver)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'REJECT', reason: 'Trying to flip an already-final decision', expectedVersion: 1 });
      expect(second.status).toBe(409);
      const stored = await prisma.kycCase.findUniqueOrThrow({ where: { id: kycCase.id } });
      expect(stored.status).toBe('APPROVED');
    });

    it('returns 404 for an unknown case', async () => {
      const res = await as(reviewer).get('/api/kyc/cases/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('authorization', () => {
    it('denies reviewers the ability to decide', async () => {
      const kycCase = await caseInReview();
      const res = await as(reviewer)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'APPROVE', reason: REASON, expectedVersion: 0 });
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('kyc.case.decide');
    });

    it('denies auditors any write access but allows reads', async () => {
      const kycCase = await caseInReview();
      const read = await as(auditor).get(`/api/kyc/cases/${kycCase.id}`);
      expect(read.status).toBe(200);

      const assign = await as(auditor)
        .post(`/api/kyc/cases/${kycCase.id}/assign`)
        .send({ assigneeId: reviewer.id });
      expect(assign.status).toBe(403);

      const comment = await as(auditor)
        .post(`/api/kyc/cases/${kycCase.id}/comments`)
        .send({ body: 'auditors are read-only' });
      expect(comment.status).toBe(403);
    });

    it('enforces four-eyes on high risk cases', async () => {
      const kycCase = await caseInReview(85, approver.id);
      const selfDecision = await as(approver)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'APPROVE', reason: REASON, expectedVersion: 0 });
      expect(selfDecision.status).toBe(403);
      expect(selfDecision.body.error.code).toBe('MAKER_CHECKER_VIOLATION');

      const secondApprover = await actor(['APPROVER']);
      const ok = await as(secondApprover)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'APPROVE', reason: REASON, expectedVersion: 0 });
      expect(ok.status).toBe(200);
    });

    it('lets admins act as the break-glass approver', async () => {
      const kycCase = await caseInReview(85, admin.id);
      const res = await as(admin)
        .post(`/api/kyc/cases/${kycCase.id}/decision`)
        .send({ decision: 'REJECT', reason: 'Break-glass rejection after compliance review', expectedVersion: 0 });
      expect(res.status).toBe(200);
    });
  });
});
