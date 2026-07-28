import type { MinorUnits } from '../money.js';

/** Refunds at or below this amount skip maker-checker approval. */
export const AUTO_APPROVE_THRESHOLD_MINOR: MinorUnits = 10_000; // $100.00

/** Refunds above this amount require an ADMIN approver, not just an APPROVER. */
export const ADMIN_APPROVAL_THRESHOLD_MINOR: MinorUnits = 500_000; // $5,000.00

export const MAX_REFUND_ATTEMPTS = 3;

export function requiresApproval(amountMinor: MinorUnits): boolean {
  return amountMinor > AUTO_APPROVE_THRESHOLD_MINOR;
}

export function requiresAdminApproval(amountMinor: MinorUnits): boolean {
  return amountMinor > ADMIN_APPROVAL_THRESHOLD_MINOR;
}

export interface RefundabilityInput {
  transactionAmountMinor: MinorUnits;
  alreadyRefundedMinor: MinorUnits;
  requestedMinor: MinorUnits;
  transactionSettled: boolean;
}

export type RefundabilityResult = { ok: true } | { ok: false; reason: string };

export function checkRefundable(input: RefundabilityInput): RefundabilityResult {
  const { transactionAmountMinor, alreadyRefundedMinor, requestedMinor, transactionSettled } = input;
  if (!transactionSettled) return { ok: false, reason: 'Transaction is not settled yet' };
  if (!Number.isInteger(requestedMinor) || requestedMinor <= 0)
    return { ok: false, reason: 'Refund amount must be a positive integer in minor units' };
  const remaining = transactionAmountMinor - alreadyRefundedMinor;
  if (requestedMinor > remaining)
    return { ok: false, reason: `Refund exceeds refundable remainder of ${remaining}` };
  return { ok: true };
}

export function canRetry(attempts: number): boolean {
  return attempts < MAX_REFUND_ATTEMPTS;
}

/** Deterministic idempotency key for a refund command. */
export function refundIdempotencyKey(transactionId: string, clientKey: string): string {
  return `${transactionId}:${clientKey}`;
}
