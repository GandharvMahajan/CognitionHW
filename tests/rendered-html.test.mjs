import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships the integrated localhost operations shell without sign-in UI", async () => {
  const [page, ui] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/operations-console.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Northstar Fintech Operations Console/);
  assert.match(page, /displayName: "Gandharv"/);
  assert.doesNotMatch(page, /signin|signup/i);
  assert.match(ui, /Command center/);
  assert.match(ui, /KYC reviews/);
  assert.match(ui, /Refunds/);
  assert.match(ui, /Feature flags/);
  assert.match(ui, /Audit trail/);
  assert.match(ui, /Loading operations data/);
  assert.match(ui, /aria-label="Primary navigation"/);
  assert.doesNotMatch(`${page}\n${ui}`, /Your site is taking shape|react-loading-skeleton/i);
});

test("ships product metadata and a bespoke social card", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /Northstar Fintech Operations Console/);
  assert.match(layout, /summary_large_image/);
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /x-forwarded-host/);
  assert.match(layout, /1200/);
  assert.match(layout, /630/);
  await access(new URL("../public/og.png", import.meta.url));
});

test("removes starter-only preview assets and metadata", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /SkeletonPreview/);
  await access(new URL("../hosting.json", import.meta.url));
});
