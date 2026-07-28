import { invalidTransition } from '../errors.js';

export const REFUND_STATUSES = [
  'REQUESTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'RECONCILED',
  'CANCELLED',
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

const TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: ['PENDING_APPROVAL', 'APPROVED', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PROCESSING', 'CANCELLED'],
  REJECTED: [],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  FAILED: ['PROCESSING'],
  SUCCEEDED: ['RECONCILED'],
  RECONCILED: [],
  CANCELLED: [],
};

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertRefundTransition(from: RefundStatus, to: RefundStatus): void {
  if (!canTransitionRefund(from, to)) throw invalidTransition(from, to);
}

export const REFUND_TERMINAL_STATUSES: RefundStatus[] = ['REJECTED', 'RECONCILED', 'CANCELLED'];

export function isRefundTerminal(status: RefundStatus): boolean {
  return REFUND_TERMINAL_STATUSES.includes(status);
}
