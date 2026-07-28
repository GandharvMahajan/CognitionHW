import { describe, expect, it } from 'vitest';
import { assertKycTransition, canTransitionKyc, isKycTerminal } from './state-machine.js';

describe('kyc state machine', () => {
  it('allows the happy path', () => {
    expect(canTransitionKyc('NEW', 'ASSIGNED')).toBe(true);
    expect(canTransitionKyc('ASSIGNED', 'IN_REVIEW')).toBe(true);
    expect(canTransitionKyc('IN_REVIEW', 'APPROVED')).toBe(true);
  });

  it('rejects skipping states', () => {
    expect(canTransitionKyc('NEW', 'APPROVED')).toBe(false);
    expect(() => assertKycTransition('NEW', 'APPROVED')).toThrowError(/Cannot transition/);
  });

  it('treats decisions as terminal', () => {
    expect(isKycTerminal('APPROVED')).toBe(true);
    expect(isKycTerminal('REJECTED')).toBe(true);
    expect(canTransitionKyc('APPROVED', 'IN_REVIEW')).toBe(false);
  });

  it('supports info requests and escalation round trips', () => {
    expect(canTransitionKyc('IN_REVIEW', 'PENDING_INFO')).toBe(true);
    expect(canTransitionKyc('PENDING_INFO', 'IN_REVIEW')).toBe(true);
    expect(canTransitionKyc('IN_REVIEW', 'ESCALATED')).toBe(true);
    expect(canTransitionKyc('ESCALATED', 'APPROVED')).toBe(true);
  });
});
