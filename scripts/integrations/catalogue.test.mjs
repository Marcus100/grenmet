import assert from "node:assert/strict";
import test from "node:test";

const INVALID_SHARED_ROUTING = /Invalid shared Sentry routing/;

test("preserves only the owner-approved existing staging Weather GA4 mapping", () => {
  const data = readCatalogue();
  const service = data.services.find((entry) => entry.id === "gms");
  const mapping = service.environments.staging.analytics;
  assert.equal(mapping.ga4, "G-6PY9N83HCP");
  assert.equal(mapping.retentionVerified, false);
  assert.equal(mapping.accessVerified, false);
  assert.deepEqual(validateCatalogue(data), []);
  service.environments.production.analytics = { ...mapping };
  assert.ok(
    validateCatalogue(data).some((failure) =>
      failure.includes("Invalid analytics continuity")
    )
  );
});

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

test("unmapped applications never inherit existing provider credentials", async () => {
  const { buildConfig } = await import("./build-config.mjs");
  assert.deepEqual(buildConfig("elections", "development"), {
    sentry_dsn: "",
    sentry_project: "",
  });
  assert.throws(() => buildConfig("missing", "production"));
});

test("existing Sentry routing preserves environment isolation without fallback", async () => {
  const { buildConfig } = await import("./build-config.mjs");
  const data = readCatalogue();
  const secrets = {
    SENTRY_DSN_STAGING: "https://stage@example.test/1",
    SENTRY_DSN_PRODUCTION: "https://prod@example.test/2",
  };
  for (const environment of ["staging", "production"]) {
    assert.equal(
      buildConfig("elections", environment, data, secrets).sentry_dsn,
      secrets[`SENTRY_DSN_${environment.toUpperCase()}`]
    );
    assert.equal(
      buildConfig("auth", environment, data, secrets).sentry_dsn,
      secrets[`SENTRY_DSN_${environment.toUpperCase()}`]
    );
    assert.equal(
      buildConfig("auth", environment, data, secrets).sentry_project,
      `grenmet-${environment}`
    );
  }
  assert.equal(
    buildConfig("auth", "staging", data, {
      SENTRY_DSN_PRODUCTION: secrets.SENTRY_DSN_PRODUCTION,
    }).sentry_dsn,
    ""
  );
  assert.equal(
    buildConfig("personal", "staging", data, secrets).sentry_dsn,
    ""
  );
  data.services.find(
    (s) => s.id === "auth"
  ).environments.staging.sentry.secretRef = "SENTRY_DSN_PRODUCTION";
  assert.throws(
    () => buildConfig("auth", "staging", data, secrets),
    INVALID_SHARED_ROUTING
  );
});
