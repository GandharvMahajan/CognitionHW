import { describe, expect, it } from 'vitest';
import {
  assertFreshVersion,
  flagRequiresApproval,
  isEnabledForSubject,
  validateRollout,
} from './policy.js';
import { canTransitionFlagChange } from './state-machine.js';

describe('flag policy', () => {
  it('requires approval for production changes only', () => {
    expect(flagRequiresApproval('production', 'TOGGLE')).toBe(true);
    expect(flagRequiresApproval('production', 'ROLLOUT')).toBe(true);
    expect(flagRequiresApproval('staging', 'TOGGLE')).toBe(false);
    expect(flagRequiresApproval('production', 'KILL_SWITCH')).toBe(false);
  });

  it('enforces optimistic concurrency', () => {
    expect(() => assertFreshVersion(3, 3)).not.toThrow();
    expect(() => assertFreshVersion(4, 3)).toThrowError(/version 4/);
  });

  it('validates rollout percentages', () => {
    expect(() => validateRollout(0)).not.toThrow();
    expect(() => validateRollout(100)).not.toThrow();
    expect(() => validateRollout(101)).toThrow();
    expect(() => validateRollout(12.5)).toThrow();
  });

  it('buckets subjects deterministically', () => {
    const state = { enabled: true, rolloutPercentage: 50 };
    const first = isEnabledForSubject(state, 'user-42');
    expect(isEnabledForSubject(state, 'user-42')).toBe(first);
    expect(isEnabledForSubject({ enabled: false, rolloutPercentage: 100 }, 'user-42')).toBe(false);
    expect(isEnabledForSubject({ enabled: true, rolloutPercentage: 100 }, 'user-42')).toBe(true);
    expect(isEnabledForSubject({ enabled: true, rolloutPercentage: 0 }, 'user-42')).toBe(false);
  });

  it('gates flag change transitions', () => {
    expect(canTransitionFlagChange('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionFlagChange('PENDING_APPROVAL', 'APPLIED')).toBe(false);
    expect(canTransitionFlagChange('APPLIED', 'APPLIED')).toBe(false);
  });
});
