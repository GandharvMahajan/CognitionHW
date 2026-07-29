import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("analyst"),
  createdAt: text("created_at").notNull(),
});

export const kycCases = sqliteTable("kyc_cases", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  entityType: text("entity_type").notNull(),
  country: text("country").notNull(),
  risk: text("risk").notNull(),
  status: text("status").notNull(),
  assignee: text("assignee"),
  slaAt: text("sla_at").notNull(),
  score: integer("score").notNull(),
  trigger: text("trigger").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const refunds = sqliteTable("refunds", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id").notNull(),
  customerName: text("customer_name").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  risk: text("risk").notNull(),
  requestedBy: text("requested_by").notNull(),
  approver: text("approver"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const flags = sqliteTable("flags", {
  id: text("id").primaryKey(),
  flagKey: text("flag_key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  environment: text("environment").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  rollout: integer("rollout").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull(),
  variant: text("variant").notNull(),
  version: integer("version").notNull(),
  expiresAt: text("expires_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const flagVersions = sqliteTable("flag_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  flagId: text("flag_id").notNull(),
  version: integer("version").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  rollout: integer("rollout").notNull(),
  variant: text("variant").notNull(),
  reason: text("reason").notNull(),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull(),
});
