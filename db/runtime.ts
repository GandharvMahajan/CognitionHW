import { env } from "cloudflare:workers";

type DbEnv = {
  DB?: D1Database;
  DOCUMENTS?: R2Bucket;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'analyst',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS kyc_cases (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    country TEXT NOT NULL,
    risk TEXT NOT NULL,
    status TEXT NOT NULL,
    assignee TEXT,
    sla_at TEXT NOT NULL,
    score INTEGER NOT NULL,
    trigger TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS refunds (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    risk TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    approver TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS flags (
    id TEXT PRIMARY KEY,
    flag_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    environment TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    rollout INTEGER NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL,
    variant TEXT NOT NULL,
    version INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS flag_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flag_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    enabled INTEGER NOT NULL,
    rollout INTEGER NOT NULL,
    variant TEXT NOT NULL,
    reason TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS kyc_cases_status_idx ON kyc_cases(status, risk)",
  "CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds(status, created_at)",
  "CREATE INDEX IF NOT EXISTS flags_env_idx ON flags(environment, flag_key)",
  "CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at DESC)",
];

const caseSeeds = [
  ["KYC-2841", "Lina Kovács", "Individual", "Hungary", "high", "unassigned", null, "2026-07-28T07:30:00.000Z", 87, "Potential sanctions name match"],
  ["KYC-2838", "Atlas Meridian Ltd.", "Business", "United Kingdom", "medium", "in_review", "gandharv@northstar.internal", "2026-07-28T12:00:00.000Z", 62, "Beneficial ownership verification"],
  ["KYC-2834", "Noah Williams", "Individual", "United States", "low", "information_requested", "jordan.lee@northstar.internal", "2026-07-29T18:00:00.000Z", 29, "Document image quality"],
  ["KYC-2829", "Horizon Imports LLC", "Business", "United States", "high", "escalated", "priya.shah@northstar.internal", "2026-07-28T06:45:00.000Z", 91, "High-risk jurisdiction exposure"],
  ["KYC-2822", "Amina Diallo", "Individual", "Senegal", "medium", "in_review", "gandharv@northstar.internal", "2026-07-29T09:00:00.000Z", 58, "Address verification mismatch"],
];

const refundSeeds = [
  ["RF-9182", "PAY-72C01A", "Oliver Grant", 1240, "USD", "Duplicate charge", "pending_approval", "medium", "jordan.lee@northstar.internal", null, "idem-rf-9182"],
  ["RF-9179", "PAY-9900BD", "Marta Silva", 85.4, "EUR", "Service not delivered", "succeeded", "low", "jordan.lee@northstar.internal", "priya.shah@northstar.internal", "idem-rf-9179"],
  ["RF-9174", "PAY-4438CA", "Ember Labs", 4900, "USD", "Merchant adjustment", "processor_pending", "high", "gandharv@northstar.internal", "priya.shah@northstar.internal", "idem-rf-9174"],
  ["RF-9168", "PAY-1188EF", "Chloe Martin", 210.75, "GBP", "Product returned", "failed", "low", "jordan.lee@northstar.internal", null, "idem-rf-9168"],
];

const flagSeeds = [
  ["FLG-101", "checkout.smart-retry", "Smart payment retries", "Route eligible failed payments through the adaptive retry model.", "production", 1, 35, "Payments", "active", "treatment", 12, "2026-10-31T00:00:00.000Z"],
  ["FLG-102", "kyc.vendor-fallback", "KYC provider fallback", "Use the secondary identity provider after two inconclusive attempts.", "production", 1, 100, "Risk Platform", "active", "enabled", 7, "2026-09-30T00:00:00.000Z"],
  ["FLG-103", "refund.instant-eligibility", "Instant refund eligibility", "Enable automated low-value refund eligibility checks.", "production", 0, 0, "Money Movement", "draft", "control", 3, "2026-08-31T00:00:00.000Z"],
  ["FLG-104", "ledger.realtime-export", "Real-time ledger export", "Stream settlement journal entries to the accounting warehouse.", "staging", 1, 100, "Ledger", "active", "enabled", 5, "2026-12-31T00:00:00.000Z"],
];

let readyPromise: Promise<void> | null = null;

export function getBindings() {
  const bindings = env as unknown as DbEnv;
  if (!bindings.DB) throw new Error("D1 binding DB is unavailable.");
  return { db: bindings.DB, documents: bindings.DOCUMENTS };
}

export async function ensureDatabase() {
  if (readyPromise) return readyPromise;
  readyPromise = initializeDatabase().catch((error) => {
    readyPromise = null;
    throw error;
  });
  return readyPromise;
}

async function initializeDatabase() {
  const { db } = getBindings();
  await db.batch(schemaStatements.map((sql) => db.prepare(sql)));
  await db.batch([
    db.prepare("UPDATE kyc_cases SET assignee = ? WHERE assignee = ?").bind("gandharv@northstar.internal", "maya.chen@northstar.internal"),
    db.prepare("UPDATE refunds SET requested_by = ? WHERE requested_by = ?").bind("gandharv@northstar.internal", "maya.chen@northstar.internal"),
    db.prepare("UPDATE refunds SET approver = ? WHERE approver = ?").bind("gandharv@northstar.internal", "maya.chen@northstar.internal"),
    db.prepare("UPDATE flags SET updated_by = ? WHERE updated_by = ?").bind("gandharv@northstar.internal", "maya.chen@northstar.internal"),
    db.prepare("UPDATE flag_versions SET actor = ? WHERE actor = ?").bind("gandharv@northstar.internal", "maya.chen@northstar.internal"),
    db.prepare("UPDATE audit_events SET actor = ? WHERE actor = ?")
      .bind("gandharv@northstar.internal", "maya.chen@northstar.internal"),
    db.prepare("UPDATE audit_events SET detail = REPLACE(detail, 'Maya Chen', 'Gandharv') WHERE detail LIKE '%Maya Chen%'"),
    db.prepare("UPDATE documents SET uploaded_by = ? WHERE uploaded_by = ?").bind("gandharv@northstar.internal", "maya.chen@northstar.internal"),
  ]);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM kyc_cases").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  await db.batch([
    ...caseSeeds.map((row) =>
      db.prepare(`INSERT INTO kyc_cases
        (id, customer_name, entity_type, country, risk, status, assignee, sla_at, score, trigger, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...row, now, now),
    ),
    ...refundSeeds.map((row) =>
      db.prepare(`INSERT INTO refunds
        (id, payment_id, customer_name, amount, currency, reason, status, risk, requested_by, approver, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...row, now, now),
    ),
    ...flagSeeds.map((row) =>
      db.prepare(`INSERT INTO flags
        (id, flag_key, name, description, environment, enabled, rollout, owner, status, variant, version, expires_at, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...row, "system@northstar.internal", now),
    ),
    db.prepare(`INSERT INTO audit_events
      (domain, entity_id, action, actor, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind("system", "SEED", "workspace_initialized", "system@northstar.internal", "Operations workspace initialized with demonstration records.", now),
  ]);
}

export async function getLocalActor() {
  const email = "gandharv@northstar.internal";
  const displayName = "Gandharv";
  const role = "admin";
  const { db } = getBindings();
  const existing = await db.prepare("SELECT role FROM users WHERE email = ?").bind(email).first<{ role: string }>();
  if (!existing) {
    await db.prepare("INSERT INTO users (email, display_name, role, created_at) VALUES (?, ?, ?, ?)")
      .bind(email, displayName, role, new Date().toISOString()).run();
  }
  return { email, displayName, role };
}

export async function audit(domain: string, entityId: string, action: string, actor: string, detail: string) {
  const { db } = getBindings();
  await db.prepare(`INSERT INTO audit_events
    (domain, entity_id, action, actor, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(domain, entityId, action, actor, detail, new Date().toISOString()).run();
}
