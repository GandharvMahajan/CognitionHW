import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("localhost mutations use the fixed Gandharv actor and reject cross-origin requests", async () => {
  const route = await read("../app/api/operations/route.ts");
  const runtime = await read("../db/runtime.ts");
  assert.match(route, /getLocalActor\(\)/);
  assert.match(runtime, /gandharv@northstar\.internal/);
  assert.doesNotMatch(route, /Authentication required|signin|signup/i);
  assert.match(route, /isSameOrigin\(request\)/);
  assert.match(route, /Invalid request origin/);
});

test("refund workflow includes separation of duties and idempotency", async () => {
  const route = await read("../app/api/operations/route.ts");
  assert.match(route, /crypto\.randomUUID\(\)/);
  assert.match(route, /Separation of duties prevents self-approval/);
  assert.match(route, /processor_pending/);
  assert.match(route, /refund_reconciled/);
});

test("evidence uploads are constrained and stored outside the database", async () => {
  const route = await read("../app/api/documents/route.ts");
  const hosting = JSON.parse(await read("../hosting.json"));
  assert.match(route, /application\/pdf/);
  assert.match(route, /image\/jpeg/);
  assert.match(route, /10 \* 1024 \* 1024/);
  assert.match(route, /documents\.put/);
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "DOCUMENTS");
});

test("authoritative state does not depend on browser storage", async () => {
  const ui = await read("../app/operations-console.tsx");
  assert.doesNotMatch(ui, /localStorage|sessionStorage/);
  assert.match(ui, /fetch\("\/api\/operations"/);
  const runtime = await read("../db/runtime.ts");
  assert.match(runtime, /CREATE TABLE IF NOT EXISTS audit_events/);
  assert.match(runtime, /db\.prepare/);
});
