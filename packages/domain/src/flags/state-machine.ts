import { invalidTransition } from '../errors.js';

export const FLAG_CHANGE_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'APPLIED',
  'CANCELLED',
] as const;

export type FlagChangeStatus = (typeof FLAG_CHANGE_STATUSES)[number];

const TRANSITIONS: Record<FlagChangeStatus, FlagChangeStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'APPLIED', 'SCHEDULED', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['APPLIED', 'SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['APPLIED', 'CANCELLED'],
  REJECTED: [],
  APPLIED: [],
  CANCELLED: [],
};

export function canTransitionFlagChange(from: FlagChangeStatus, to: FlagChangeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertFlagChangeTransition(from: FlagChangeStatus, to: FlagChangeStatus): void {
  if (!canTransitionFlagChange(from, to)) throw invalidTransition(from, to);
}
