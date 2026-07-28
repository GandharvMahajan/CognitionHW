# Requirements checklist

Every requirement, where it is implemented and the tests that prove it. All suites pass:
**29 domain unit + 65 API integration/authorization + 16 Playwright E2E = 110 tests.**

Run them with `pnpm test:unit`, `pnpm test:api`, `pnpm test:e2e`.

## KYC Review Queue

| Requirement | Implementation | Tests |
| --- | --- | --- |
| Searchable / filterable case queue | `apps/api/src/modules/kyc/service.ts` `listCases`, `apps/web/src/app/console/kyc` | api: *searches, filters and paginates the queue with SLA state* · e2e: *filters the queue and opens a case workspace* |
| Assignment | `POST /api/kyc/cases/:id/assign` | api: *walks assign → review → approve and audits every step* · e2e: *reviewer works a case and an approver decides it* |
| Risk indicators | `packages/domain/src/kyc/risk.ts` | unit: *maps scores to risk levels* |
| SLA indicators and breach sweep | `riskSla` + `apps/api/src/jobs/sla-sweep.ts` | unit: *computes sla due dates per risk*, *flags breached and at-risk cases* · api: *exposes queue metrics*, *notifies approvers once per SLA-breached case*, *ignores decided cases when sweeping SLAs* |
| Customer / document review workspace | `apps/web/src/app/console/kyc/[id]` , `POST .../documents/:docId/review` | api: *walks assign → review → approve and audits every step* · e2e: *reviewer works a case and an approver decides it* |
| Approve / reject | `POST /api/kyc/cases/:id/decision` | api: *walks assign → review → approve…*, *does not allow deciding a case twice* · e2e: *reviewer works a case and an approver decides it* |
| Request information | `POST /api/kyc/cases/:id/request-info` | api: *supports request-info, escalation and comments* |
| Escalate | `POST /api/kyc/cases/:id/escalate` | api: *supports request-info, escalation and comments* |
| Comments | `POST /api/kyc/cases/:id/comments` | api: *supports request-info, escalation and comments* · e2e: *reviewer works a case and an approver decides it* |
| Audit history | `recordAudit` + `AuditTrail` component | api: *walks assign → review → approve and audits every step* · e2e: *reviewer works a case and an approver decides it* |
| Role-based reviewer / approver / admin / auditor access | `packages/domain/src/permissions.ts`, `requirePermission` | unit: *lets reviewers make but not approve*, *lets approvers approve but not use admin-only powers*, *grants auditors read-only access*, *gives admins every capability…* · api: *denies reviewers the ability to decide*, *denies auditors any write access but allows reads*, *lets admins act as the break-glass approver* · e2e: *hides the audit log from reviewers but shows it to auditors* |
| Four-eyes on high risk | `requiresSecondApprover` | unit: *requires a second approver for high risk* · api: *enforces four-eyes on high risk cases* |
| Validation / stale / invalid transition | Zod schemas + `assertUpdated` + state machine | unit: *rejects short reasons on KYC decisions*, *rejects skipping states*, *treats decisions as terminal* · api: *rejects a decision reason that is too short*, *rejects a stale expectedVersion*, *rejects transitions that the state machine forbids*, *returns 404 for an unknown case* · e2e: *surfaces validation errors from the server* |

## Refunds Dashboard

| Requirement | Implementation | Tests |
| --- | --- | --- |
| Refund metrics | `GET /api/refunds/metrics` | api: *filters refunds and exposes metrics* |
| Filters and queue | `GET /api/refunds`, `apps/web/src/app/console/refunds` | api: *filters refunds and exposes metrics* · e2e: *auditors can read refunds but cannot request them* |
| Transaction details and customer history | `GET /api/refunds/:id`, `GET /api/refunds/transactions` | api: *returns transaction and customer history on the detail view* |
| Full and partial refunds | `POST /api/refunds` | unit: *validates refundable amounts* · api: *auto-approves and executes small refunds through the worker*, *never refunds more than the remaining transaction amount* · e2e: *auto-approves a small refund below the approval threshold*, *rejects a refund larger than the refundable remainder* |
| Approval thresholds | `packages/domain/src/refunds/policy.ts` | unit: *applies approval thresholds* · api: *routes refunds above the threshold to approval instead of executing*, *requires an admin above the admin approval threshold* · e2e: *requires a second approver above the threshold and blocks self-approval* |
| Maker-checker | `violatesMakerChecker` | unit: *blocks self-approval (maker-checker)* · api: *blocks the requester from approving their own refund* · e2e: *requires a second approver above the threshold and blocks self-approval* |
| Idempotent execution via mocked provider | `services/payment-gateway.ts`, `idempotencyKey` | unit: *derives stable idempotency keys* · api: *treats a repeated idempotency key as a replay, not a second refund*, *rejects a reused idempotency key with a different amount*, *does not move money twice when execution is replayed* |
| Retries | `POST /api/refunds/:id/retry`, `refund.execute` job | unit: *caps retries*, *allows retry only from FAILED* · api: *retries a failed refund and succeeds on the second attempt*, *stops retrying after the attempt cap*, *refuses to retry a refund that did not fail* |
| Reconciliation | `POST /api/refunds/:id/reconcile` | api: *approves, executes and reconciles a refund* |
| Complete approval and audit trail | `recordAudit` on every command | api: *approves, executes and reconciles a refund*, *stores before/after snapshots for state changes* · e2e: *requires a second approver above the threshold and blocks self-approval* |
| Validation / stale / duplicate decisions | Zod schemas + `assertUpdated` | unit: *requires positive integer refund amounts and an idempotency key*, *never moves money straight from REQUESTED* · api: *rejects unsettled transactions and malformed amounts*, *rejects stale approvals and double decisions*, *returns 404 for an unknown transaction* |
| Permission enforcement | `requirePermission` | api: *enforces permissions across refund commands* · e2e: *auditors can read refunds but cannot request them* |

## Feature-Flag Admin Panel

| Requirement | Implementation | Tests |
| --- | --- | --- |
| Inventory by service and environment | `GET /api/flags`, `apps/web/src/app/console/flags` | api: *lists flags by service and environment* |
| Enable / disable | `POST /api/flags/:id/changes` (`TOGGLE`) | api: *applies immediately without approval* · e2e: *queues production changes for a second approver* |
| Percentage rollout | `POST /api/flags/:id/changes` (`ROLLOUT`) | unit: *validates rollout percentages*, *buckets subjects deterministically* · e2e: *applies a staging change immediately*, *rejects an out-of-range rollout percentage* |
| Scheduling | `SCHEDULE` change + `flag.apply_scheduled_change` job | api: *schedules a future change and applies it from the worker* |
| Approval for production (maker-checker) | `flagRequiresApproval`, `POST /api/flags/changes/:id/decision` | unit: *requires approval for production changes only* · api: *queues production changes for approval instead of applying them*, *applies the change once a different approver signs off*, *blocks self-approval*, *rejects a change and leaves the flag untouched* · e2e: *queues production changes for a second approver* |
| Rollback | `POST /api/flags/:id/rollback` | api: *rolls a flag back to the state before the last applied change* |
| History | `GET /api/flags/:id` (changes + audit) | api: *lists flags by service and environment* · e2e: *queues production changes for a second approver* |
| Optimistic concurrency | `expectedVersion` + `assertFreshVersion` | unit: *enforces optimistic concurrency*, *gates flag change transitions* · api: *rejects a change based on a stale flag version*, *rejects approval when the flag moved on since the request* |
| Emergency kill switch with mandatory reason | `POST /api/flags/:id/kill-switch` (+ `/release`) | unit: *requires kind-specific fields for flag changes* · api: *requires an admin and a reason, then disables the flag* · e2e: *admin engages the kill switch with a mandatory reason*, *non-admins cannot see the kill switch* |
| Auditing of every change | `recordAudit` | api: *requires an admin and a reason, then disables the flag* · e2e: *admin engages the kill switch with a mandatory reason* |
| Authorization | `requirePermission` | api: *lets admins create flags and denies everyone else*, *denies reviewers approval rights and auditors change rights* |

## Shared platform

| Requirement | Implementation | Tests |
| --- | --- | --- |
| Authentication | argon2id + JWT cookie/Bearer, `apps/api/src/auth` | api: *signs a user in and records an audit event*, *rejects a wrong password…*, *rejects unknown accounts and deactivated users*, *validates the login payload*, *requires authentication on protected routes*, *returns the current principal with resolved permissions*, *rejects a tampered token*, *logs out and audits the event* · e2e: *rejects bad credentials with an inline error*, *signs a reviewer in and out*, *redirects anonymous visitors to the login page* |
| RBAC | `packages/domain/src/rbac.ts` | unit: all 6 `rbac` tests · api: authorization suites in every module |
| Queues | KYC queue, refund queue, pending flag changes | api: *searches, filters and paginates…*, *filters refunds and exposes metrics* |
| Workflow state machines | `packages/domain/src/*/state-machine.ts` | unit: `kyc state machine` (4), `refund state machine` (3), *gates flag change transitions* |
| Approvals | refund thresholds, KYC four-eyes, flag maker-checker | see per-app rows above |
| Comments | `Comment` model + `CommentThread` | api: *supports request-info, escalation and comments* |
| Notifications | `services/notifications.ts` + inbox | api: *delivers assignment notifications and marks them read*, *does not leak notifications between users*, *notifies approvers once per SLA-breached case* |
| Background jobs | `apps/api/src/jobs` | api: *does not run jobs scheduled for the future*, *retries a failing job with backoff and gives up after the cap* |
| Immutable audit events | `recordAudit` + `prevent_audit_mutation` trigger | api: *is immutable at the database level*, *stores before/after snapshots for state changes*, *lets auditors read the stream and filter it*, *denies reviewers access to the audit stream*, *allows approvers to read audit history* |
| Commands stay server-side | Next.js `submitCommand` only POSTs; all mutations live in API services | e2e: every mutating spec drives the UI and asserts server-side outcomes |

## Deliverables

| Deliverable | Where |
| --- | --- |
| Functional responsive UI | `apps/web` (Tailwind, mobile-first grids), verified by the Playwright suite |
| Secure backend APIs | `apps/api` (Helmet, CORS allow-list, rate limiting, Zod validation, RBAC) |
| Database schema and migrations | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations` |
| Automated test suite | 110 tests: Vitest (unit + API) and Playwright (E2E) |
| Seeded demo accounts for each role | `packages/db/src/seed.ts`, listed in the README |
| CI configuration | `.github/workflows/ci.yml` (lint, typecheck, unit, API, E2E with Postgres services) |
| Docker-based local setup | `docker-compose.yml`, `Dockerfile` |
| API documentation | `apps/api/src/openapi.ts`, served at `/docs` and `/openapi.json` · api: *serves an OpenAPI document covering every module*, *exposes a health endpoint* |
| Setup and architecture documentation | `README.md`, `docs/ARCHITECTURE.md` |
| Final requirement/test checklist | this file |
