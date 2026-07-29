import { assessRefund, canTransitionCase, createId } from "../../../lib/domain.mjs";
import { ensureDatabase, getBindings, getLocalActor } from "../../../db/runtime";

export const dynamic = "force-dynamic";

type ActionPayload = {
  action?: string;
  id?: string;
  decision?: string;
  note?: string;
  paymentId?: string;
  customerName?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  flagKey?: string;
  name?: string;
  description?: string;
  environment?: string;
  owner?: string;
  enabled?: boolean;
  rollout?: number;
  variant?: string;
};

export async function GET() {
  try {
    await ensureDatabase();
    const actor = await getLocalActor();
    const { db } = getBindings();
    const [cases, refunds, flags, auditEvents, documents] = await Promise.all([
      db.prepare("SELECT * FROM kyc_cases ORDER BY CASE risk WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, sla_at ASC").all(),
      db.prepare("SELECT * FROM refunds ORDER BY created_at DESC").all(),
      db.prepare("SELECT * FROM flags ORDER BY environment ASC, flag_key ASC").all(),
      db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 80").all(),
      db.prepare("SELECT id, case_id, file_name, content_type, size, uploaded_by, created_at FROM documents ORDER BY created_at DESC").all(),
    ]);
    return Response.json({
      actor,
      cases: cases.results,
      refunds: refunds.results,
      flags: flags.results,
      audit: auditEvents.results,
      documents: documents.results,
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const actor = await getLocalActor();
    if (!isSameOrigin(request)) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const payload = (await request.json()) as ActionPayload;
    const { db } = getBindings();

    switch (payload.action) {
      case "case.assign": {
        if (!payload.id) return badRequest("Case ID is required.");
        const item = await db.prepare("SELECT * FROM kyc_cases WHERE id = ?").bind(payload.id).first<Record<string, unknown>>();
        if (!item) return notFound("KYC case");
        if (item.status === "approved" || item.status === "rejected") return conflict("Closed cases cannot be assigned.");
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE kyc_cases SET assignee = ?, status = CASE WHEN status = 'unassigned' THEN 'in_review' ELSE status END, updated_at = ? WHERE id = ?")
            .bind(actor.email, now, payload.id),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("kyc", payload.id, "case_assigned", actor.email, `Assigned to ${actor.displayName}.`, now),
        ]);
        return Response.json({ ok: true, message: `${payload.id} is now assigned to you.` });
      }
      case "case.decision": {
        if (!payload.id || !payload.decision) return badRequest("Case ID and decision are required.");
        if (!payload.note?.trim()) return badRequest("A decision rationale is required.");
        const item = await db.prepare("SELECT status FROM kyc_cases WHERE id = ?").bind(payload.id).first<{ status: string }>();
        if (!item) return notFound("KYC case");
        if (!canTransitionCase(item.status, payload.decision)) {
          return conflict(`Cannot transition this case from ${item.status} to ${payload.decision}.`);
        }
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE kyc_cases SET status = ?, assignee = COALESCE(assignee, ?), updated_at = ? WHERE id = ?")
            .bind(payload.decision, actor.email, now, payload.id),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("kyc", payload.id, `case_${payload.decision}`, actor.email, payload.note.trim(), now),
        ]);
        return Response.json({ ok: true, message: `${payload.id} moved to ${humanize(payload.decision)}.` });
      }
      case "refund.create": {
        const amount = Number(payload.amount);
        if (!payload.paymentId?.trim() || !payload.customerName?.trim() || !payload.reason?.trim()) {
          return badRequest("Payment ID, customer, and reason are required.");
        }
        const assessment = assessRefund({ amount, refundableBalance: 10_000, settled: true, disputed: false });
        if (!assessment.eligible) return badRequest(assessment.reasons.join(" "));
        const id = createId("RF");
        const idempotencyKey = crypto.randomUUID();
        const status = assessment.approvalRequired ? "pending_approval" : "approved";
        const now = new Date().toISOString();
        await db.batch([
          db.prepare(`INSERT INTO refunds
            (id, payment_id, customer_name, amount, currency, reason, status, risk, requested_by, approver, idempotency_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
            .bind(id, payload.paymentId.trim().toUpperCase(), payload.customerName.trim(), amount, payload.currency ?? "USD", payload.reason.trim(), status, assessment.risk, actor.email, idempotencyKey, now, now),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("refunds", id, "refund_requested", actor.email, `${payload.currency ?? "USD"} ${amount.toFixed(2)} · ${payload.reason.trim()}`, now),
        ]);
        return Response.json({ ok: true, id, status, message: `${id} created ${assessment.approvalRequired ? "and routed for approval" : "and cleared for execution"}.` }, { status: 201 });
      }
      case "refund.approve": {
        if (!payload.id) return badRequest("Refund ID is required.");
        const item = await db.prepare("SELECT status, requested_by FROM refunds WHERE id = ?").bind(payload.id).first<{ status: string; requested_by: string }>();
        if (!item) return notFound("Refund");
        if (item.status !== "pending_approval") return conflict("Only pending refunds can be approved.");
        if (item.requested_by === actor.email) return conflict("Separation of duties prevents self-approval.");
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE refunds SET status = 'approved', approver = ?, updated_at = ? WHERE id = ?").bind(actor.email, now, payload.id),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("refunds", payload.id, "refund_approved", actor.email, "Refund passed maker-checker approval.", now),
        ]);
        return Response.json({ ok: true, message: `${payload.id} approved.` });
      }
      case "refund.execute": {
        if (!payload.id) return badRequest("Refund ID is required.");
        const item = await db.prepare("SELECT status FROM refunds WHERE id = ?").bind(payload.id).first<{ status: string }>();
        if (!item) return notFound("Refund");
        if (item.status !== "approved") return conflict("Refund must be approved before execution.");
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE refunds SET status = 'processor_pending', updated_at = ? WHERE id = ?").bind(now, payload.id),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("refunds", payload.id, "refund_submitted", actor.email, "Idempotent refund command submitted to the processor.", now),
        ]);
        return Response.json({ ok: true, message: `${payload.id} submitted to the payment processor.` });
      }
      case "refund.reconcile": {
        if (!payload.id) return badRequest("Refund ID is required.");
        const item = await db.prepare("SELECT status FROM refunds WHERE id = ?").bind(payload.id).first<{ status: string }>();
        if (!item) return notFound("Refund");
        if (item.status !== "processor_pending") return conflict("Only processor-pending refunds can be reconciled.");
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE refunds SET status = 'succeeded', updated_at = ? WHERE id = ?").bind(now, payload.id),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("refunds", payload.id, "refund_reconciled", actor.email, "Processor event matched the internal ledger entry.", now),
        ]);
        return Response.json({ ok: true, message: `${payload.id} reconciled successfully.` });
      }
      case "flag.update": {
        if (!payload.id || !payload.reason?.trim()) return badRequest("Flag ID and change reason are required.");
        const rollout = Number(payload.rollout);
        if (!Number.isInteger(rollout) || rollout < 0 || rollout > 100) return badRequest("Rollout must be between 0 and 100.");
        const item = await db.prepare("SELECT * FROM flags WHERE id = ?").bind(payload.id).first<Record<string, unknown>>();
        if (!item) return notFound("Feature flag");
        if (item.environment === "production" && actor.role !== "admin") return Response.json({ error: "Production flag changes require an administrator." }, { status: 403 });
        const enabled = payload.enabled ? 1 : 0;
        const version = Number(item.version) + 1;
        const variant = payload.variant?.trim() || String(item.variant);
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE flags SET enabled = ?, rollout = ?, variant = ?, version = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?")
            .bind(enabled, rollout, variant, version, enabled ? "active" : "paused", actor.email, now, payload.id),
          db.prepare("INSERT INTO flag_versions (flag_id, version, enabled, rollout, variant, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(payload.id, version, enabled, rollout, variant, payload.reason.trim(), actor.email, now),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("flags", payload.id, "flag_configuration_published", actor.email, `v${version}: ${enabled ? "on" : "off"} at ${rollout}% · ${payload.reason.trim()}`, now),
        ]);
        return Response.json({ ok: true, version, message: `${String(item.flag_key)} v${version} published.` });
      }
      case "flag.create": {
        if (!payload.flagKey?.trim() || !payload.name?.trim() || !payload.description?.trim() || !payload.reason?.trim()) {
          return badRequest("Key, name, description, and change reason are required.");
        }
        if (!/^[a-z][a-z0-9.-]+$/.test(payload.flagKey.trim())) return badRequest("Flag key must use lowercase letters, numbers, dots, or hyphens.");
        const id = createId("FLG");
        const now = new Date().toISOString();
        const environment = payload.environment ?? "development";
        await db.batch([
          db.prepare(`INSERT INTO flags
            (id, flag_key, name, description, environment, enabled, rollout, owner, status, variant, version, expires_at, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'draft', 'control', 1, ?, ?, ?)`)
            .bind(id, payload.flagKey.trim(), payload.name.trim(), payload.description.trim(), environment, payload.owner?.trim() || "Platform", new Date(Date.now() + 90 * 86400000).toISOString(), actor.email, now),
          db.prepare("INSERT INTO flag_versions (flag_id, version, enabled, rollout, variant, reason, actor, created_at) VALUES (?, 1, 0, 0, 'control', ?, ?, ?)")
            .bind(id, payload.reason.trim(), actor.email, now),
          db.prepare("INSERT INTO audit_events (domain, entity_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind("flags", id, "flag_created", actor.email, `${payload.flagKey.trim()} created in ${environment}.`, now),
        ]);
        return Response.json({ ok: true, id, message: `${payload.flagKey.trim()} created as a safe-off draft.` }, { status: 201 });
      }
      default:
        return badRequest("Unsupported operation.");
    }
  } catch (error) {
    return routeError(error);
  }
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return new URL(origin).origin === new URL(request.url).origin;
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function conflict(error: string) {
  return Response.json({ error }, { status: 409 });
}

function notFound(entity: string) {
  return Response.json({ error: `${entity} not found.` }, { status: 404 });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}
