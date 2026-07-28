export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export function riskFromScore(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

/** SLA in hours, tightened for higher-risk cases. */
export const SLA_HOURS_BY_RISK: Record<RiskLevel, number> = {
  CRITICAL: 4,
  HIGH: 12,
  MEDIUM: 24,
  LOW: 72,
};

export type SlaState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

export function slaDueAt(createdAt: Date, risk: RiskLevel): Date {
  return new Date(createdAt.getTime() + SLA_HOURS_BY_RISK[risk] * 3600_000);
}

export function slaState(dueAt: Date, now: Date = new Date()): SlaState {
  const msLeft = dueAt.getTime() - now.getTime();
  if (msLeft <= 0) return 'BREACHED';
  if (msLeft <= 4 * 3600_000) return 'AT_RISK';
  return 'ON_TRACK';
}

/** High-risk cases require a second approver even when the reviewer can decide. */
export function requiresSecondApproval(risk: RiskLevel): boolean {
  return risk === 'HIGH' || risk === 'CRITICAL';
}
