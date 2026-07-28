import { staleWrite } from '../errors.js';

export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type FlagEnvironment = (typeof ENVIRONMENTS)[number];

export const FLAG_CHANGE_KINDS = [
  'TOGGLE',
  'ROLLOUT',
  'SCHEDULE',
  'ROLLBACK',
  'KILL_SWITCH',
] as const;
export type FlagChangeKind = (typeof FLAG_CHANGE_KINDS)[number];

export interface FlagState {
  enabled: boolean;
  rolloutPercentage: number;
}

/** Production changes always go through maker-checker approval. */
export function requiresApproval(environment: FlagEnvironment, kind: FlagChangeKind): boolean {
  if (kind === 'KILL_SWITCH') return false; // emergency path, audited instead
  return environment === 'production';
}

export function assertFreshVersion(currentVersion: number, expectedVersion: number): void {
  if (currentVersion !== expectedVersion) {
    throw staleWrite(
      `Flag has version ${currentVersion} but the change was based on version ${expectedVersion}`,
    );
  }
}

export function validateRollout(percentage: number): void {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('Rollout percentage must be an integer between 0 and 100');
  }
}

/** Stable bucketing so a given subject keeps the same rollout decision. */
export function isEnabledForSubject(state: FlagState, subjectKey: string): boolean {
  if (!state.enabled) return false;
  if (state.rolloutPercentage >= 100) return true;
  if (state.rolloutPercentage <= 0) return false;
  let hash = 2166136261;
  for (let i = 0; i < subjectKey.length; i++) {
    hash ^= subjectKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 100) < state.rolloutPercentage;
}
