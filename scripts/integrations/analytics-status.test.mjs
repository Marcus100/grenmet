import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyticsStatus } from "./analytics-status.mjs";

test("accounts for every public Next.js reader and keeps operational consoles excluded", () => {
  const rows = analyticsStatus();
  for (const app of ["signal", "elections", "gms", "docs", "mbia"]) {
    const layout = readFileSync(
      new URL(`../../apps/web/${app}/src/app/layout.tsx`, import.meta.url),
      "utf8"
    );
    assert.ok(layout.includes(`<PostHogProvider app="${app}">`));
    assert.equal(rows.filter((row) => row.app === app).length, 2);
  }
  for (const app of ["auth", "gaa-admin", "cms", "events"]) {
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
    "measurement ID needed"
  );
});
