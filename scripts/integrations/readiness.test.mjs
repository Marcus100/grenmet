import assert from "node:assert/strict";
import test from "node:test";
import { githubInventory, readiness } from "./readiness.mjs";

const row = (report, service) =>
  report.integrations.find((entry) => entry.service === service);

test("missing optional providers remain distinct from deployment requirements", () => {
  const report = readiness("production", [], {});
  assert.equal(row(report, "Core deployment").required, true);
  assert.equal(row(report, "Stripe billing").required, false);
  assert.equal(row(report, "Stripe billing").status, "missing");
  assert.equal(row(report, "Host monitoring").status, "disabled");
});

test("matches deployment aliases without crossing Sentry environments", () => {
  const report = readiness(
    "production",
    [
      "DO_SPACES_ENDPOINT",
      "DO_SPACES_REGION",
      "DO_SPACES_BUCKET",
      "STORAGE_ACCESS_KEY_ID",
      "DO_SPACES_SECRET_ACCESS_KEY",
      "SENTRY_DSN_STAGING",
      "GOOGLE_CLIENT_ID",
    ],
    {}
  );
  assert.equal(
    row(report, "Application storage").status,
    "configured-unverified"
  );
  assert.equal(row(report, "Sentry reporting").status, "missing");
  assert.deepEqual(row(report, "Google sign-in").missing, [
    "GOOGLE_CLIENT_SECRET",
  ]);
});

test("activation requires exact flags and associated credentials", () => {
  const report = readiness("staging", ["PROBE_HEARTBEAT_URL"], {
    MONITORING_DEPLOY_ENABLED: "true",
    TELEMETRY_ENABLED: "TRUE",
  });
  assert.equal(row(report, "Host monitoring").status, "incomplete");
  assert.equal(
    row(report, "Operational counters").status,
    "invalid-activation-flag"
  );
});

test("billing allows documented non-secret variables but never variable-based keys", () => {
  const vars = Object.fromEntries(
    [
      "BILLING_STRIPE_SECRET_KEY",
      "BILLING_STRIPE_WEBHOOK_SECRET",
      "BILLING_STRIPE_PRICE_ID",
      "BILLING_CHECKOUT_SUCCESS_URL",
      "BILLING_CHECKOUT_CANCEL_URL",
    ].map((key) => [key, "DO-NOT-PRINT"])
  );
  const report = readiness("production", [], vars);
  assert.deepEqual(row(report, "Stripe billing").missing, [
    "BILLING_STRIPE_SECRET_KEY",
    "BILLING_STRIPE_WEBHOOK_SECRET",
  ]);
  assert.ok(!JSON.stringify(report).includes("DO-NOT-PRINT"));
});

test("GitHub metadata reads paginate and never issue mutations", () => {
  const calls = [];
  const inventory = githubInventory("staging", (command, args) => {
    calls.push([command, args]);
    return JSON.stringify(
      args.at(-1).includes("/secrets?")
        ? [{ secrets: [{ name: "FIRST" }] }, { secrets: [{ name: "LAST" }] }]
        : [{ variables: [{ name: "TELEMETRY_ENABLED", value: "false" }] }]
    );
  });
  assert.deepEqual(inventory.secrets, ["FIRST", "LAST"]);
  assert.equal(inventory.variables.TELEMETRY_ENABLED, "false");
  assert.ok(
    calls.every(
      ([command, args]) =>
        command === "gh" &&
        args.includes("--paginate") &&
        args.includes("--slurp") &&
        args.at(-1).includes("/environments/staging/")
    )
  );
});

test("invalid environment is rejected before issuing any request", () => {
  assert.throws(() =>
    githubInventory("production-backup", () => assert.fail("must not request"))
  );
  assert.throws(() => readiness("development", [], {}));
});

test("worker heartbeat is independent from optional operational counters", () => {
  const report = readiness("staging", ["WORKER_HEARTBEAT_URL"], {});
  assert.equal(row(report, "Worker heartbeat").status, "configured-unverified");
  assert.equal(row(report, "Operational counters").status, "disabled");
});
