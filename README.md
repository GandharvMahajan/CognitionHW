# Northstar Fintech Operations Console

A single internal operations workspace for:

- KYC case intake, assignment, evidence review, documented decisions, and audit history
- refund eligibility, maker-checker approval, idempotent submission, and reconciliation
- feature-flag creation, environment separation, progressive rollout, immutable versions, and change evidence

The console is built as a Cloudflare Worker-compatible Vinext application. Structured workflow state is stored in D1 and protected KYC evidence is stored in R2.

## Local security model

- The console runs locally without sign-in or sign-up screens.
- Local operations are attributed to the fixed administrator identity `Gandharv`.
- Mutating APIs reject cross-origin requests.
- Production flag changes still require the local administrator role.
- Refund approval enforces separation of duties.
- Refund execution uses durable identifiers and idempotency keys.
- Audit records are append-only application events.
- Evidence uploads are limited to PDF, JPEG, and PNG files up to 10 MB.
- Cardholder data and secrets must never be stored in this application.

Before connecting real financial systems or exposing the console beyond localhost, add organization-managed authentication and authorization, replace the demonstration processor and screening data with approved provider adapters, and have compliance, security, and finance approve the operating policies.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The local workspace initializes demonstration records so the complete workflows can be exercised without external providers.

## Validation

```bash
npm test
npm run lint
```

The automated suite covers:

- KYC transition policy
- refund eligibility, thresholds, and blocking conditions
- deterministic percentage rollout
- fixed local identity and same-origin mutation contracts
- maker-checker and idempotency controls
- evidence storage constraints
- product metadata and hosting bindings
- absence of browser storage as an authoritative data source

Browser-level verification covers:

- KYC queue search, assignment, rationale-required approval, and audit evidence
- evidence upload through the D1/R2 integration
- refund creation, automatic eligibility, maker-checker approval, processor submission, and reconciliation
- safe-off flag creation, environment isolation, precise rollout publication, and version history
- unified audit history
- responsive navigation and horizontal-overflow checks at a 390 × 844 viewport

## Data and integration boundaries

The console owns workflow state, approvals, annotations, and audit evidence. It should not become the source of truth for payment transactions, customer identity, sanctions data, accounting balances, or experiment analytics. Connect those systems through server-side provider adapters and signed webhooks.

Production integrations should include:

- an approved identity/KYC provider and sanctions-screening source
- the payment processor and ledger
- email or internal-notification delivery
- organization-managed identity groups and role assignments before any non-local use
- centralized logs, alerts, data retention, and access reviews
