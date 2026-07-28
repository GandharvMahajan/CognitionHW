import { describe, expect, it } from 'vitest';
import { createRefundSchema } from './refunds.js';
import { flagChangeRequestSchema } from './flags.js';
import { kycDecisionSchema } from './kyc.js';

describe('command schemas', () => {
  it('rejects short reasons on KYC decisions', () => {
    expect(kycDecisionSchema.safeParse({ decision: 'APPROVE', reason: 'ok', expectedVersion: 1 }).success).toBe(false);
    expect(
      kycDecisionSchema.safeParse({ decision: 'APPROVE', reason: 'Documents verified against registry', expectedVersion: 1 }).success,
    ).toBe(true);
  });

  it('requires positive integer refund amounts and an idempotency key', () => {
    const base = { transactionId: 't1', kind: 'PARTIAL', reason: 'Customer reported duplicate charge' };
    expect(createRefundSchema.safeParse({ ...base, amountMinor: 100, idempotencyKey: 'key-12345' }).success).toBe(true);
    expect(createRefundSchema.safeParse({ ...base, amountMinor: -1, idempotencyKey: 'key-12345' }).success).toBe(false);
    expect(createRefundSchema.safeParse({ ...base, amountMinor: 1.5, idempotencyKey: 'key-12345' }).success).toBe(false);
    expect(createRefundSchema.safeParse({ ...base, amountMinor: 100 }).success).toBe(false);
  });

  it('requires kind-specific fields for flag changes', () => {
    const reason = 'Rolling out to canary cohort';
    expect(flagChangeRequestSchema.safeParse({ kind: 'TOGGLE', reason, expectedVersion: 1 }).success).toBe(false);
    expect(flagChangeRequestSchema.safeParse({ kind: 'TOGGLE', enabled: true, reason, expectedVersion: 1 }).success).toBe(true);
    expect(flagChangeRequestSchema.safeParse({ kind: 'ROLLOUT', rolloutPercentage: 25, reason, expectedVersion: 1 }).success).toBe(true);
    expect(flagChangeRequestSchema.safeParse({ kind: 'ROLLOUT', reason, expectedVersion: 1 }).success).toBe(false);
  });
});
