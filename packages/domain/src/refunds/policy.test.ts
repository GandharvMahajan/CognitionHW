import { describe, expect, it } from 'vitest';
import {
  canRetry,
  checkRefundable,
  refundIdempotencyKey,
  requiresAdminApproval,
  requiresApproval,
} from './policy.js';
import { assertRefundTransition, canTransitionRefund } from './state-machine.js';

describe('refund policy', () => {
  it('applies approval thresholds', () => {
    expect(requiresApproval(9_999)).toBe(false);
    expect(requiresApproval(10_000)).toBe(false);
    expect(requiresApproval(10_001)).toBe(true);
    expect(requiresAdminApproval(500_001)).toBe(true);
    expect(requiresAdminApproval(500_000)).toBe(false);
  });

  it('validates refundable amounts', () => {
    const base = { transactionAmountMinor: 10_000, alreadyRefundedMinor: 2_000, transactionSettled: true };
    expect(checkRefundable({ ...base, requestedMinor: 8_000 })).toEqual({ ok: true });
    expect(checkRefundable({ ...base, requestedMinor: 8_001 }).ok).toBe(false);
    expect(checkRefundable({ ...base, requestedMinor: 0 }).ok).toBe(false);
    expect(checkRefundable({ ...base, requestedMinor: 10.5 }).ok).toBe(false);
    expect(checkRefundable({ ...base, transactionSettled: false, requestedMinor: 100 }).ok).toBe(false);
  });

  it('caps retries', () => {
    expect(canRetry(0)).toBe(true);
    expect(canRetry(2)).toBe(true);
    expect(canRetry(3)).toBe(false);
  });

  it('derives stable idempotency keys', () => {
    expect(refundIdempotencyKey('txn_1', 'abc')).toBe('txn_1:abc');
    expect(refundIdempotencyKey('txn_1', 'abc')).toBe(refundIdempotencyKey('txn_1', 'abc'));
  });
});

describe('refund state machine', () => {
  it('walks the execution lifecycle', () => {
    expect(canTransitionRefund('REQUESTED', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransitionRefund('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionRefund('APPROVED', 'PROCESSING')).toBe(true);
    expect(canTransitionRefund('PROCESSING', 'SUCCEEDED')).toBe(true);
    expect(canTransitionRefund('SUCCEEDED', 'RECONCILED')).toBe(true);
  });

  it('allows retry only from FAILED', () => {
    expect(canTransitionRefund('FAILED', 'PROCESSING')).toBe(true);
    expect(canTransitionRefund('SUCCEEDED', 'PROCESSING')).toBe(false);
    expect(() => assertRefundTransition('RECONCILED', 'PROCESSING')).toThrowError(/Cannot transition/);
  });

  it('never moves money straight from REQUESTED', () => {
    expect(canTransitionRefund('REQUESTED', 'PROCESSING')).toBe(false);
    expect(canTransitionRefund('REQUESTED', 'SUCCEEDED')).toBe(false);
  });
});
