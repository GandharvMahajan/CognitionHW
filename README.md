# Fintech Operations Console

An internal operations console for a payments company, built as a TypeScript monorepo. It contains
three integrated back-office apps on one shared platform:

| App | What it does |
| --- | --- |
| **KYC Review Queue** | Searchable case queue with risk/SLA indicators, assignment, a document review workspace, approve / reject / request-info / escalate commands and full audit history. |
| **Refunds Dashboard** | Refund metrics, filters and queue, transaction and customer history, full/partial refund requests with approval thresholds, idempotent execution through a mocked payment provider, retries and reconciliation. |
| **Feature-Flag Admin** | Flag inventory per service and environment, enable/disable, percentage rollout, scheduling, maker-checker approval for production, rollback, change history and an emergency kill switch. |

Every sensitive action is a **server-side command**. The browser never mutates a KYC decision, moves
money or changes a production flag directly; it POSTs a command that the API validates, authorises,
executes inside a transaction and records as an immutable audit event.

## Stack

- **pnpm workspaces** monorepo, TypeScript everywhere
- **Express 4** command/query API with Zod validation and OpenAPI 3 docs (Swagger UI)
- **Next.js 14** (App Router, React Server Components) + Tailwind CSS
- **PostgreSQL 16** with **Prisma 5** migrations and a seeded demo dataset
- **JWT** session in an HTTP-only cookie, **argon2id** password hashing, Helmet, CORS, rate limiting
- **Vitest** (unit + API integration with Supertest) and **Playwright** (UI end-to-end)

```
apps/
  api/     Express API: auth, KYC, refunds, flags, audit, notifications, background jobs
  web/     Next.js operations console
  e2e/     Playwright end-to-end specs
packages/
  domain/  Roles, permissions, workflow state machines, approval policies, Zod schemas
  db/      Prisma schema, migrations, seed script, generated client
  ui/      Shared React components (buttons, tables, badges, layout primitives)
```

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Console: http://localhost:3000
- API: http://localhost:4000
- API docs: http://localhost:4000/docs
- Health: http://localhost:4000/api/health

`docker compose` runs migrations and the demo seed before starting the API.

## Quick start (local Node)

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
cp .env.example .env

# Postgres only, if you do not have one running
docker compose up -d postgres

pnpm --filter @fintech/db exec prisma generate
pnpm db:migrate
pnpm db:seed

pnpm dev            # API on :4000, console on :3000
```

## Demo accounts

Password for every account: `Password123!`

| Email | Roles | Can do |
| --- | --- | --- |
| `admin@fintech.test` | ADMIN | Everything, incl. flag creation, kill switch, high-value refunds |
| `approver@fintech.test` | APPROVER | Approve KYC decisions, refunds and production flag changes |
| `approver2@fintech.test` | APPROVER | Second approver (maker-checker / four-eyes scenarios) |
| `reviewer@fintech.test` | REVIEWER | Work KYC cases, request refunds, request flag changes |
| `reviewer2@fintech.test` | REVIEWER | Second reviewer |
| `auditor@fintech.test` | AUDITOR | Read-only access, including the audit log |

## Tests

```bash
pnpm lint            # eslint, zero warnings allowed
pnpm typecheck       # tsc --noEmit in every workspace
pnpm test:unit       # domain unit tests (Vitest)
pnpm test:api        # API integration / authorization tests (Vitest + Supertest)
pnpm test:e2e        # Playwright UI end-to-end (boots API + console + seeded e2e database)
pnpm test            # everything except e2e
```

The API tests need `DATABASE_URL` to point at a throwaway database (CI uses `fintech_test`); they
truncate and reseed between suites. `pnpm test:e2e` provisions its own `fintech_e2e` database,
applies migrations, seeds it, then builds and boots the API and console.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | – | PostgreSQL connection string |
| `JWT_SECRET` | – | Session signing secret (min 16 chars) |
| `API_PORT` | `4000` | API port |
| `WEB_PORT` | `3000` | Console port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API origin used by the console |
| `API_INTERNAL_URL` | `NEXT_PUBLIC_API_URL` | Server-to-server API origin (Docker networking) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed browser origin |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | `10` | Login attempts per minute per IP |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – domain model, command flow, RBAC, concurrency, jobs
- [`docs/REQUIREMENTS-CHECKLIST.md`](docs/REQUIREMENTS-CHECKLIST.md) – every requirement mapped to its tests
- `http://localhost:4000/docs` – interactive OpenAPI reference (raw document at `/openapi.json`)
