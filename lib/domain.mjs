const caseTransitions = {
  unassigned: ["in_review"],
  in_review: ["approved", "rejected", "information_requested", "escalated"],
  information_requested: ["in_review", "rejected"],
  escalated: ["in_review", "approved", "rejected"],
  approved: [],
  rejected: [],
};

export function canTransitionCase(from, to) {
  return Boolean(caseTransitions[from]?.includes(to));
}

export function assessRefund({ amount, refundableBalance, settled, disputed }) {
  const reasons = [];
  if (!Number.isFinite(amount) || amount <= 0) reasons.push("Amount must be positive.");
  if (amount > refundableBalance) reasons.push("Amount exceeds the refundable balance.");
  if (!settled) reasons.push("Payment has not settled.");
  if (disputed) reasons.push("Payment has an active dispute.");
  return {
    eligible: reasons.length === 0,
    reasons,
    approvalRequired: amount >= 500,
    risk: amount >= 2500 ? "high" : amount >= 500 ? "medium" : "low",
  };
}

export function deterministicBucket(flagKey, subjectKey) {
  let hash = 2166136261;
  const input = `${flagKey}:${subjectKey}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function evaluateFlag({ enabled, rollout, flagKey, subjectKey }) {
  if (!enabled) return { enabled: false, reason: "flag_disabled" };
  const bucket = deterministicBucket(flagKey, subjectKey);
  return {
    enabled: bucket < Math.max(0, Math.min(100, rollout)),
    bucket,
    reason: "percentage_rollout",
  };
}

export function createId(prefix, random = Math.random) {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.floor(random() * 1679616).toString(36).padStart(4, "0").toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}
