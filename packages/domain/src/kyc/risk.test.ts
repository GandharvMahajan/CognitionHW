import { describe, expect, it } from 'vitest';
import { requiresSecondApproval, riskFromScore, slaDueAt, slaState } from './risk.js';

describe('kyc risk + sla', () => {
  it('maps scores to risk levels', () => {
    expect(riskFromScore(10)).toBe('LOW');
    expect(riskFromScore(30)).toBe('MEDIUM');
    expect(riskFromScore(60)).toBe('HIGH');
    expect(riskFromScore(95)).toBe('CRITICAL');
  });

  it('computes sla due dates per risk', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    expect(slaDueAt(created, 'CRITICAL').toISOString()).toBe('2026-01-01T04:00:00.000Z');
    expect(slaDueAt(created, 'LOW').toISOString()).toBe('2026-01-04T00:00:00.000Z');
  });

  it('flags breached and at-risk cases', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    expect(slaState(new Date('2026-01-01T11:00:00Z'), now)).toBe('BREACHED');
    expect(slaState(new Date('2026-01-01T14:00:00Z'), now)).toBe('AT_RISK');
    expect(slaState(new Date('2026-01-02T14:00:00Z'), now)).toBe('ON_TRACK');
  });

  it('requires a second approver for high risk', () => {
    expect(requiresSecondApproval('HIGH')).toBe(true);
    expect(requiresSecondApproval('CRITICAL')).toBe(true);
    expect(requiresSecondApproval('LOW')).toBe(false);
  });
});
