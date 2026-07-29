import assert from "node:assert/strict";
import test from "node:test";
import {
  assessRefund,
  canTransitionCase,
  createId,
  deterministicBucket,
  evaluateFlag,
} from "../lib/domain.mjs";

test("KYC transitions enforce review-state policy", () => {
  assert.equal(canTransitionCase("unassigned", "in_review"), true);
  assert.equal(canTransitionCase("in_review", "approved"), true);
  assert.equal(canTransitionCase("in_review", "information_requested"), true);
  assert.equal(canTransitionCase("approved", "in_review"), false);
  assert.equal(canTransitionCase("unassigned", "approved"), false);
});

test("refund assessment validates balance, settlement, and disputes", () => {
  const eligible = assessRefund({ amount: 85, refundableBalance: 100, settled: true, disputed: false });
  assert.deepEqual(eligible, {
    eligible: true,
    reasons: [],
    approvalRequired: false,
    risk: "low",
  });

  const blocked = assessRefund({ amount: 120, refundableBalance: 100, settled: false, disputed: true });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.reasons.length, 3);
  assert.match(blocked.reasons.join(" "), /refundable balance/);
  assert.match(blocked.reasons.join(" "), /not settled/);
  assert.match(blocked.reasons.join(" "), /active dispute/);
});

test("refund thresholds produce maker-checker and risk controls", () => {
  assert.equal(assessRefund({ amount: 500, refundableBalance: 5000, settled: true, disputed: false }).approvalRequired, true);
  assert.equal(assessRefund({ amount: 2500, refundableBalance: 5000, settled: true, disputed: false }).risk, "high");
});

test("percentage rollout is deterministic and bounded", () => {
  const bucket = deterministicBucket("checkout.smart-retry", "customer-123");
  assert.equal(bucket, deterministicBucket("checkout.smart-retry", "customer-123"));
  assert.ok(bucket >= 0 && bucket <= 99);
  assert.equal(evaluateFlag({ enabled: false, rollout: 100, flagKey: "x.y", subjectKey: "a" }).enabled, false);
  assert.equal(evaluateFlag({ enabled: true, rollout: 0, flagKey: "x.y", subjectKey: "a" }).enabled, false);
  assert.equal(evaluateFlag({ enabled: true, rollout: 100, flagKey: "x.y", subjectKey: "a" }).enabled, true);
});

test("generated operational identifiers are namespaced", () => {
  const id = createId("RF", () => 0);
  assert.match(id, /^RF-[A-Z0-9]+-0000$/);
});
