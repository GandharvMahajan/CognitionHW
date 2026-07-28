# Architecture

## Shape

```
Browser ──▶ Next.js console (RSC)  ──▶ /api/* proxy ──▶ Express API ──▶ PostgreSQL
             server components fetch          commands            transactions +
             read models with the cookie      (POST only)         audit events
```

The console never holds domain logic. Server components read data with the session cookie; client
components submit **commands** (`POST /api/...`) through `submitCommand`, which surfaces the API's
error code and message verbatim. Any state change — a KYC decision, a refund, a production flag
change — happens only inside an API transaction that also writes the audit event.

## Packages

- **`packages/domain`** – framework-free core: roles and permissions, RBAC resolution, workflow
  state machines (`kyc`, `refunds`, `flags`), approval policies (refund thresholds, production flag
  approval, maker-checker), money helpers and every Zod request schema. Both the API and the console
  import it, so validation rules cannot drift.
- **`packages/db`** – Prisma schema, migrations, generated client and the demo seed.
- **`packages/ui`** – shared presentational React components used by all three apps.
- **`apps/api`** – Express app: `modules/<domain>/{routes,service}.ts` plus shared services
  (`audit`, `notifications`, `jobs`, `concurrency`, `payment-gateway`).
- **`apps/web`** – Next.js App Router console with one route group per app.

## Authentication and RBAC

- `POST /api/auth/login` verifies an argon2id hash and issues a JWT, set as an HTTP-only,
  `sameSite=lax` cookie (`secure` in production). A `Bearer` token is also accepted for API clients.
- Roles: `ADMIN`, `APPROVER`, `REVIEWER`, `AUDITOR`. Each role maps to a fixed permission set in
  `packages/domain/src/permissions.ts`; routes declare the permission they need
  (`requirePermission('refund.approve')`). Nothing is enforced only in the UI — the console merely
  hides controls the session cannot use.
- `AUDITOR` is strictly read-only and is the only non-admin role with `audit.read`.

## Workflow state machines

Each domain owns an explicit transition map; illegal transitions raise `INVALID_TRANSITION` instead
of silently updating a row.

- **KYC**: `NEW → ASSIGNED → IN_REVIEW → {PENDING_INFO, ESCALATED, PENDING_APPROVAL} → APPROVED | REJECTED`.
  `HIGH`/`CRITICAL` risk cases need a second approver (four-eyes): the first approval parks the case
  in `PENDING_APPROVAL`.
- **Refunds**: `REQUESTED → {APPROVED, REJECTED} → EXECUTING → {SUCCEEDED, FAILED} → RECONCILED`,
  with `FAILED → EXECUTING` for retries (capped).
- **Flag changes**: `DRAFT → {PENDING_APPROVAL, APPLIED, SCHEDULED} → {APPROVED → APPLIED, REJECTED}`.

## Approvals and maker-checker

- Refunds ≤ `$100.00` are auto-approved; above that an approver must sign off, and above
  `$5,000.00` the approver must be an admin.
- Production flag changes always require a second approver; non-production changes apply immediately.
- The requester can never approve their own command (`MAKER_CHECKER_VIOLATION`).

## Optimistic concurrency

Mutable aggregates (`KycCase`, `Refund`, `FeatureFlag`) carry a `version` column. Commands send
`expectedVersion`; services claim the row with a conditional `updateMany` and reject a zero-row
result with `STALE_WRITE`. Approving a flag change also re-checks the flag version the maker saw, so
a change approved after someone else moved the flag is rejected rather than silently overwriting it.

## Idempotent money movement

`POST /api/refunds` requires an `idempotencyKey`, unique per refund. Replaying the same key with the
same payload returns the original refund; replaying it with a different payload returns
`IDEMPOTENCY_CONFLICT`. Execution goes through the mocked provider in
`apps/api/src/services/payment-gateway.ts`, which deduplicates by provider idempotency key, so a
retried or duplicated job can never move money twice. Every attempt is recorded in `RefundAttempt`.

## Background jobs

`Job` rows are claimed with the same optimistic technique (`status=PENDING AND runAt<=now()`), so
multiple workers are safe. Handlers live in `apps/api/src/jobs`:

- `refund.execute` – executes approved refunds, records attempts, retries with backoff up to the cap
- `flag.apply_scheduled_change` – applies a scheduled flag change at its due time
- `kyc.sla_sweep` – flags SLA breaches and notifies approvers once per case

## Immutable audit events

`recordAudit` writes an `AuditEvent` (actor, action, entity, summary, before/after snapshot,
metadata) inside the same transaction as the change it describes, so an audited action either
happens with its event or not at all. A PostgreSQL trigger (`prevent_audit_mutation`) raises on
`UPDATE`/`DELETE` of `AuditEvent`, so the log is append-only even for someone with database access.

## Notifications

`notifyUsers` writes `Notification` rows in the same transaction (assignment, SLA breach, approval
needed, decision made). The console polls them through the inbox in the header.

## Error contract

All failures return `{ "error": { "code", "message" } }` with codes such as `VALIDATION_ERROR`,
`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_TRANSITION`, `STALE_WRITE`,
`MAKER_CHECKER_VIOLATION`, `IDEMPOTENCY_CONFLICT`, `RETRY_LIMIT_EXCEEDED`, `RATE_LIMITED`. The UI
renders the code and message, which is what the E2E specs assert on.
