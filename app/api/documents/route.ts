import { createId } from "../../../lib/domain.mjs";
import { audit, ensureDatabase, getBindings, getLocalActor } from "../../../db/runtime";

export const dynamic = "force-dynamic";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxSize = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const actor = await getLocalActor();
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const formData = await request.formData();
    const caseId = String(formData.get("caseId") ?? "");
    const file = formData.get("file");
    if (!caseId || !(file instanceof File)) return Response.json({ error: "Case and file are required." }, { status: 400 });
    if (!allowedTypes.has(file.type)) return Response.json({ error: "Only PDF, JPEG, and PNG evidence is accepted." }, { status: 400 });
    if (file.size > maxSize) return Response.json({ error: "Evidence files must be smaller than 10 MB." }, { status: 400 });

    const { db, documents } = getBindings();
    if (!documents) return Response.json({ error: "Document storage is unavailable." }, { status: 503 });
    const exists = await db.prepare("SELECT id FROM kyc_cases WHERE id = ?").bind(caseId).first();
    if (!exists) return Response.json({ error: "KYC case not found." }, { status: 404 });
    const id = createId("DOC");
    const storageKey = `kyc/${caseId}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await documents.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { caseId, uploadedBy: actor.email },
    });
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO documents
      (id, case_id, file_name, content_type, size, storage_key, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, caseId, file.name, file.type, file.size, storageKey, actor.email, now).run();
    await audit("kyc", caseId, "evidence_uploaded", actor.email, `${file.name} added to the protected document vault.`);
    return Response.json({ ok: true, id, message: `${file.name} uploaded securely.` }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
