import { invalidTransition } from '../errors.js';

export const KYC_STATUSES = [
  'NEW',
  'ASSIGNED',
  'IN_REVIEW',
  'PENDING_INFO',
  'ESCALATED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_TERMINAL_STATUSES: KycStatus[] = ['APPROVED', 'REJECTED'];

const TRANSITIONS: Record<KycStatus, KycStatus[]> = {
  NEW: ['ASSIGNED'],
  ASSIGNED: ['IN_REVIEW', 'ASSIGNED'],
  IN_REVIEW: ['PENDING_INFO', 'ESCALATED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
  PENDING_INFO: ['IN_REVIEW', 'ESCALATED', 'REJECTED'],
  ESCALATED: ['IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'PENDING_INFO', 'ESCALATED'],
  APPROVED: [],
  REJECTED: [],
};

export function canTransitionKyc(from: KycStatus, to: KycStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertKycTransition(from: KycStatus, to: KycStatus): void {
  if (!canTransitionKyc(from, to)) throw invalidTransition(from, to);
}

export function isKycTerminal(status: KycStatus): boolean {
  return KYC_TERMINAL_STATUSES.includes(status);
}
