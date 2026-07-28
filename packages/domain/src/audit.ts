export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'kyc.case.assigned',
  'kyc.case.review_started',
  'kyc.case.info_requested',
  'kyc.case.info_received',
  'kyc.case.escalated',
  'kyc.case.approved',
  'kyc.case.rejected',
  'kyc.comment.created',
  'kyc.document.reviewed',
  'refund.requested',
  'refund.approved',
  'refund.rejected',
  'refund.execution_started',
  'refund.execution_succeeded',
  'refund.execution_failed',
  'refund.retried',
  'refund.reconciled',
  'flag.created',
  'flag.change_requested',
  'flag.change_approved',
  'flag.change_rejected',
  'flag.change_applied',
  'flag.rolled_back',
  'flag.kill_switch_engaged',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType = 'KYC_CASE' | 'REFUND' | 'FEATURE_FLAG' | 'FLAG_CHANGE' | 'USER';

export interface AuditEventInput {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  actorId: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}
