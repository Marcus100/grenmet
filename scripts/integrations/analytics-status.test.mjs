import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyticsStatus } from "./analytics-status.mjs";

const GA4_ID = /^G-[A-Z0-9]+$/;

test("accounts for every public Next.js reader and keeps operational consoles excluded", () => {
  const rows = analyticsStatus();
  for (const app of ["signal", "elections", "gms", "docs", "mbia", "events"]) {
    const layout = readFileSync(
      new URL(
        `../../apps/web/${app}/src/app/${app === "events" ? "(public)/" : ""}layout.tsx`,
        import.meta.url
      ),
      "utf8"
    );
    assert.ok(layout.includes(`<PostHogProvider app="${app}">`));
    assert.equal(rows.filter((row) => row.app === app).length, 2);
  }
  for (const app of ["auth", "gaa-admin", "cms"]) {
    assert.ok(
      rows
        .filter((row) => row.app === app)
        .every((row) => row.status === "not a public analytics surface")
    );
  }
  assert.equal(
    rows.find((row) => row.app === "gms" && row.environment === "staging")
      .status,
    "configured; live delivery unverified"
  );
  assert.equal(
    rows.find((row) => row.app === "signal" && row.environment === "production")
      .status,
    "configured; live delivery unverified"
  );
});

test("every deployed public origin has its own configured GA4 destination", () => {
  const rows = analyticsStatus().filter(
    (row) => row.origin && row.status !== "not a public analytics surface"
  );
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map((row) => row.ga4)).size, rows.length);
  for (const row of rows) {
    assert.match(row.ga4, GA4_ID);
    assert.equal(row.status, "configured; live delivery unverified");
  }
});
