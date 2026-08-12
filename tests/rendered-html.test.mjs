import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /<title>Advisor Client Engagement Workspace<\/title>/i);
  assert.match(html, /Client Engagement Workspace/);
  assert.match(html, /Book 360/);
  assert.match(html, /Durable workspace/);
});

test("ships durable workspace bindings and governed operations", async () => {
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_narrow_omega_sentinel.sql", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");

  assert.equal(hosting.d1, "DB");
  assert.match(migration, /CREATE TABLE `audit_events`/);
  assert.match(migration, /CREATE TABLE `planner_scenarios`/);
  assert.match(route, /Unsupported action/);
  assert.match(route, /save_planner/);
});
