import { describe, expect, it } from 'vitest';
import { can, canAll, permissionsFor, violatesMakerChecker } from './rbac.js';

describe('rbac', () => {
  it('grants auditors read-only access', () => {
    const auditor = { roles: ['AUDITOR' as const] };
    expect(can(auditor, 'kyc.case.read')).toBe(true);
    expect(can(auditor, 'audit.read')).toBe(true);
    expect(can(auditor, 'kyc.case.decide')).toBe(false);
    expect(can(auditor, 'refund.request')).toBe(false);
    expect(can(auditor, 'flag.change.request')).toBe(false);
  });

  it('lets reviewers make but not approve', () => {
    const reviewer = { roles: ['REVIEWER' as const] };
    expect(canAll(reviewer, ['kyc.case.review', 'refund.request', 'flag.change.request'])).toBe(true);
    expect(can(reviewer, 'kyc.case.decide')).toBe(false);
    expect(can(reviewer, 'refund.approve')).toBe(false);
    expect(can(reviewer, 'flag.change.approve')).toBe(false);
  });

  it('lets approvers approve but not use admin-only powers', () => {
    const approver = { roles: ['APPROVER' as const] };
    expect(canAll(approver, ['kyc.case.decide', 'refund.approve', 'flag.change.approve'])).toBe(true);
    expect(can(approver, 'flag.killswitch')).toBe(false);
    expect(can(approver, 'refund.reconcile')).toBe(false);
    expect(can(approver, 'user.manage')).toBe(false);
  });

  it('gives admins every capability used by the console', () => {
    const admin = { roles: ['ADMIN' as const] };
    for (const p of ['flag.killswitch', 'refund.reconcile', 'user.manage', 'kyc.case.decide'] as const) {
      expect(can(admin, p)).toBe(true);
    }
  });

  it('unions permissions across multiple roles', () => {
    const perms = permissionsFor(['REVIEWER', 'AUDITOR']);
    expect(perms.has('audit.read')).toBe(true);
    expect(perms.has('kyc.case.review')).toBe(true);
    expect(perms.has('flag.killswitch')).toBe(false);
  });

  it('blocks self-approval (maker-checker)', () => {
    expect(violatesMakerChecker('user-1', 'user-1')).toBe(true);
    expect(violatesMakerChecker('user-1', 'user-2')).toBe(false);
  });
});
