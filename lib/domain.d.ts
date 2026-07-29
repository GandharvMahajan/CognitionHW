export function canTransitionCase(from: string, to: string): boolean;
export function assessRefund(input: {
  amount: number;
  refundableBalance: number;
  settled: boolean;
  disputed: boolean;
}): {
  eligible: boolean;
  reasons: string[];
  approvalRequired: boolean;
  risk: "low" | "medium" | "high";
};
export function deterministicBucket(flagKey: string, subjectKey: string): number;
export function evaluateFlag(input: {
  enabled: boolean;
  rollout: number;
  flagKey: string;
  subjectKey: string;
}): { enabled: boolean; bucket?: number; reason: string };
export function createId(prefix: string, random?: () => number): string;
