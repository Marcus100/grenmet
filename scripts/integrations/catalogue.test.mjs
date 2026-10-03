import assert from "node:assert/strict";
import test from "node:test";
import { readCatalogue, validateCatalogue } from "./catalogue.mjs";

test("all services have isolated dev/staging/production coverage", () => {
  const data = readCatalogue();
  assert.deepEqual(validateCatalogue(data), []);
  assert.equal(data.services.length, 14);
  assert.equal(
    data.services.filter(
      (s) => s.environments.production.availability.kind === "direct"
    ).length,
    10
  );
});
test("rejects cross-owner and cross-environment analytics destinations", () => {
  const data = readCatalogue();
  for (const id of ["elections", "gms"]) {
    const config = data.services.find((s) => s.id === id).environments
      .production.analytics;
    Object.assign(config, {
      ga4: "G-SHARED",
      retentionVerified: true,
      accessVerified: true,
    });
  }
  assert.ok(validateCatalogue(data).some((f) => f.includes("Shared provider")));
  data.services[0].environments.staging.origin = "https://barrels.gd";
  assert.ok(validateCatalogue(data).some((f) => f.includes("Staging origin")));
});
test("rejects false delivery claims and staff GA4", () => {
  const data = readCatalogue();
  const entry = data.services.find((s) => s.id === "auth").environments
    .production;
  entry.analytics.ga4 = "G-STAFF";
  entry.sentry.status = "delivery-verified";
  assert.ok(validateCatalogue(data).some((f) => f.includes("Non-public")));
  assert.ok(
    validateCatalogue(data).some((f) => f.includes("Missing delivery"))
  );
});

test("build mappings never reuse the legacy environment-wide provider keys", async () => {
  const { buildConfig } = await import("./build-config.mjs");
  assert.deepEqual(buildConfig("elections", "development"), {
    sentry_dsn: "",
    sentry_project: "",
  });
  assert.throws(() => buildConfig("missing", "production"));
});
