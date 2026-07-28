export const PERMISSIONS = [
  // KYC
  'kyc.case.read',
  'kyc.case.assign',
  'kyc.case.review',
  'kyc.case.decide',
  'kyc.case.escalate',
  'kyc.comment.create',
  // Refunds
  'refund.read',
  'refund.request',
  'refund.approve',
  'refund.execute',
  'refund.retry',
  'refund.reconcile',
  // Feature flags
  'flag.read',
  'flag.change.request',
  'flag.change.approve',
  'flag.rollback',
  'flag.killswitch',
  // Cross-cutting
  'audit.read',
  'notification.read',
  'user.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
