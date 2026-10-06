import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function fixture(directory) {
  const env = {
    ...process.env,
    CORE_POSTGRES_IMAGE: `postgres:17@sha256:${"a".repeat(64)}`,
    CORE_REDIS_IMAGE: `redis:7-alpine@sha256:${"b".repeat(64)}`,
    CORE_PRIVATE_IP: "10.10.0.2",
    DEPLOY_IMAGE_TAG: `sha-${"a".repeat(40)}`,
  };
  env.NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS = undefined;
  for (const key of [
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "FASTAPI_DB_PASSWORD",
    "SECRET_KEY",
    "FIRST_SUPERUSER",
    "FIRST_SUPERUSER_PASSWORD",
    "SESSION_COOKIE_NAME",
    "RESEND_API_KEY",
    "EMAIL",
    "USERNAME",
    "HASHED_PASSWORD",
    "PAYLOAD_SECRET",
  ])
    env[key] = "test-only-configuration-value-32-characters";
  const lines = ["FASTAPI_DB_USER=app_runtime", "ENVIRONMENT=staging"];
  for (const domain of [
    "WXWATCH",
    "WXPRODUCTS",
    "EREGISTER",
    "TRANSPORT",
    "JANITORIAL",
    "EVENTS",
    "CMS",
  ]) {
    lines.push(
      `${domain}_DB_USER=${domain.toLowerCase()}`,
      `${domain}_DB_NAME=${domain.toLowerCase()}`
    );
    env[`${domain}_DB_PASSWORD`] = "p@ss$word'with\\slashes";
  }
  const config = join(directory, "config.txt");
  writeFileSync(config, lines.join("\n"));
  return { env, config, destination: join(directory, "runtime.txt") };
}

test("runtime configuration protects quoting, URL credentials and permissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "delivery-env-"));
  try {
    const { env, config, destination } = fixture(directory);
    env.PAYLOAD_SECRET = "literal-$dollar-'quote'-and-\\slash-32-characters";
    execFileSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      { env }
    );
    // biome-ignore lint/suspicious/noBitwiseOperators: mask file type bits to verify secret permissions.
    assert.equal(statSync(destination).mode & 0o777, 0o600);
    const model = join(directory, "compose.yml");
    writeFileSync(
      model,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Docker Compose interpolation under test.
      "services:\n  probe:\n    image: busybox\n    environment:\n      PAYLOAD_SECRET: ${PAYLOAD_SECRET}\n      URL: ${CMS_DATABASE_URL}\n"
    );
    const parsed = JSON.parse(
      execFileSync(
        "docker",
        [
          "compose",
          "--env-file",
          destination,
          "-f",
          model,
          "config",
          "--format",
          "json",
        ],
        {
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
          encoding: "utf8",
        }
      )
    );
    assert.equal(
      parsed.services.probe.environment.PAYLOAD_SECRET.replaceAll("$$", "$"),
      env.PAYLOAD_SECRET
    );
    assert.equal(
      decodeURIComponent(
        new URL(parsed.services.probe.environment.URL).password
      ),
      env.CMS_DB_PASSWORD
    );
    assert.ok(readFileSync(destination, "utf8").includes('TAG="staging-sha-'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("rejects missing secrets, multiline values and mutable references without echoing values", () => {
  for (const change of [
    { EVENTS_DB_PASSWORD: "" },
    { CMS_DB_PASSWORD: "" },
    { FASTAPI_DB_PASSWORD: "" },
    { SECRET_KEY: "DO-NOT-ECHO\ninvalid" },
    { DEPLOY_IMAGE_TAG: "latest" },
    { CORE_REDIS_IMAGE: "redis:latest" },
    { TELEMETRY_ENABLED: "TRUE" },
    { TELEMETRY_WORKER_HEARTBEAT_URL: "https://example.test/DO-NOT-ECHO" },
    {
      TELEMETRY_WORKER_HEARTBEAT_URL:
        "https://uptime.betterstack.com:DO-NOT-ECHO/api/v1/heartbeat/token",
    },
    {
      TELEMETRY_WORKER_HEARTBEAT_URL:
        "https://uptime.betterstack.com/api/v1/heartbeat/",
    },
    {
      TELEMETRY_WORKER_HEARTBEAT_URL:
        "https://uptime.betterstack.com/api/v1/heartbeat/DO-NOT-ECHO?token=private",
    },
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "delivery-env-"));
    try {
      const { env, config, destination } = fixture(directory);
      const result = spawnSync(
        "python3",
        ["scripts/production/render-env.py", config, destination],
        { env: { ...env, ...change }, encoding: "utf8" }
      );
      assert.notEqual(result.status, 0);
      assert.equal(result.stderr.includes("DO-NOT-ECHO"), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("staging and production pass integrations to the intended services", () => {
  for (const deploymentEnvironment of ["staging", "production"]) {
    const directory = mkdtempSync(join(tmpdir(), "integration-config-"));
    try {
      const { env, config, destination } = fixture(directory);
      writeFileSync(
        config,
        readFileSync(`infra/docker/${deploymentEnvironment}.env`, "utf8")
      );
      Object.assign(env, {
        SENTRY_DSN: "https://unused@example.test/1",
        SENTRY_DSN_STAGING: "https://stage@example.test/1",
        SENTRY_DSN_PRODUCTION: "https://prod@example.test/2",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        BILLING_STRIPE_SECRET_KEY:
          deploymentEnvironment === "staging"
            ? "sk_test_fixture"
            : "sk_live_fixture",
        BILLING_STRIPE_WEBHOOK_SECRET: "whsec_fixture",
        BILLING_STRIPE_PRICE_ID: "price_fixture",
        BILLING_CHECKOUT_SUCCESS_URL:
          "https://auth.example.test/?checkout=success",
        BILLING_CHECKOUT_CANCEL_URL:
          "https://auth.example.test/?checkout=cancelled",
        GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "fixture-only",
        EMAIL_RENDER_SECRET: "fixture-only",
        RESEND_WEBHOOK_SECRET: "whsec_fixture",
        TELEMETRY_ENABLED: "true",
        TELEMETRY_WORKER_HEARTBEAT_URL:
          "https://uptime.betterstack.com/api/v1/heartbeat/test-only",
        CAP_SIGNING_CERT:
          "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
        CAP_SIGNING_KEY:
          "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----",
      });
      execFileSync(
        "python3",
        ["scripts/production/render-env.py", config, destination],
        { env }
      );
      const model = JSON.parse(
        execFileSync(
          "docker",
          [
            "compose",
            "--env-file",
            config,
            "--env-file",
            destination,
            "-f",
            "infra/docker/docker-compose.deploy.yml",
            "config",
            "--format",
            "json",
          ],
          {
            env: { PATH: process.env.PATH, HOME: process.env.HOME },
            encoding: "utf8",
          }
        )
      );
      const cms = model.services["web-cms"];
      const events = model.services["web-events"].environment;
      assert.equal(
        model.services.api.environment.API_BASE_URL,
        {
          staging: "https://api.staging.barrels.gd",
          production: "https://api.barrels.gd",
        }[deploymentEnvironment]
      );
      assert.equal(
        model.services.worker.environment.API_BASE_URL,
        model.services.api.environment.API_BASE_URL
      );
      assert.equal(events.AUTH_API_URL, "http://api:8000");
      assert.equal(events.AUTH_API_V1_STR, "/api/v1");
      const eventsDatabase = new URL(
        model.services.api.environment.EVENTS_DATABASE_URL
      );
      assert.equal(eventsDatabase.username, "events");
      assert.equal(eventsDatabase.hostname, "db");
      assert.equal(
        eventsDatabase.pathname,
        deploymentEnvironment === "staging" ? "/events_staging" : "/events"
      );
      assert.equal(
        model.services.prestart.environment.EVENTS_DATABASE_URL,
        eventsDatabase.href
      );
      assert.equal(
        model.services.db.environment.EVENTS_DB_PASSWORD.replaceAll("$$", "$"),
        env.EVENTS_DB_PASSWORD
      );
      assert.equal(cms.environment.CMS_MEDIA_DIR, "/app/media");
      assert.ok(
        cms.volumes.some(
          (volume) =>
            volume.type === "volume" &&
            volume.source === "cms-media" &&
            volume.target === "/app/media"
        )
      );
      assert.ok(model.volumes["cms-media"]);
      const api = model.services.api.environment;
      assert.equal(api.CAP_SIGNING_CERT, env.CAP_SIGNING_CERT);
      assert.equal(
        api.BILLING_STRIPE_SECRET_KEY,
        env.BILLING_STRIPE_SECRET_KEY
      );
      assert.equal(
        api.SENTRY_DSN,
        env[`SENTRY_DSN_${deploymentEnvironment.toUpperCase()}`]
      );
      assert.equal(api.REDIS_URL, "redis://redis:6379/0");
      assert.equal(api.EMAIL_RENDER_URL, "http://web-auth:3000");
      const baseDomain =
        deploymentEnvironment === "staging"
          ? "staging.barrels.gd"
          : "barrels.gd";
      for (const service of [api, model.services.worker.environment]) {
        assert.equal(service.RESEND_API_KEY, env.RESEND_API_KEY);
        assert.equal(service.EMAILS_FROM_EMAIL, "noreply@barrels.gd");
        assert.equal(service.EMAIL_RENDER_URL, "http://web-auth:3000");
        assert.equal(service.EMAIL_RENDER_SECRET, env.EMAIL_RENDER_SECRET);
        assert.equal(
          service.NOTIFICATIONS_WEB_BASE_URL,
          `https://admin.${baseDomain}`
        );
        assert.equal(
          service.NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS,
          deploymentEnvironment === "staging" ? "barrels.gd" : ""
        );
      }
      for (const [key, subdomain] of Object.entries({
        ADMIN_APP_URL: "admin",
        DOCS_APP_URL: "docs",
        GMS_APP_URL: "weather",
        SIGNAL_APP_URL: "signal",
        MBIA_APP_URL: "mbia",
        EVENTS_APP_URL: "events",
      })) {
        assert.equal(
          model.services["web-auth"].environment[key],
          `https://${subdomain}.${baseDomain}`
        );
      }
      assert.equal(
        model.services.worker.environment.SENTRY_DSN,
        api.SENTRY_DSN
      );
      assert.equal(model.services.worker.environment.TELEMETRY_ENABLED, "true");
      assert.equal(
        model.services.worker.environment.TELEMETRY_WORKER_HEARTBEAT_URL,
        env.TELEMETRY_WORKER_HEARTBEAT_URL
      );
      assert.equal(
        model.services["web-gms"].environment.CAP_API_URL,
        "http://api:8000"
      );
      assert.equal(
        model.services["web-gms"].environment.WXPRODUCTS_API_URL,
        undefined
      );
      assert.equal(
        model.services["web-auth"].environment.EMAIL_RENDER_SECRET,
        env.EMAIL_RENDER_SECRET
      );
      for (const service of ["web-auth", "web-admin", "web-docs", "web-gms"]) {
        assert.equal(
          model.services[service].environment.NEXT_PUBLIC_POSTHOG_KEY,
          undefined
        );
        assert.equal(
          model.services[service].environment.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
          deploymentEnvironment
        );
        assert.equal(
          model.services[service].environment.BILLING_STRIPE_SECRET_KEY,
          undefined
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
test("notification recipient policy defaults safely and accepts explicit domains", () => {
  for (const [environment, configured, expected] of [
    ["staging", undefined, "barrels.gd"],
    ["staging", "  ", "barrels.gd"],
    ["production", undefined, ""],
    [
      "staging",
      "Example.test, STAFF.Example.test",
      "example.test,staff.example.test",
    ],
    ["production", "example.test", "example.test"],
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "notification-policy-"));
    try {
      const { env, config, destination } = fixture(directory);
      writeFileSync(
        config,
        readFileSync(config, "utf8").replace(
          "ENVIRONMENT=staging",
          `ENVIRONMENT=${environment}`
        )
      );
      if (configured !== undefined)
        env.NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS = configured;
      execFileSync(
        "python3",
        ["scripts/production/render-env.py", config, destination],
        { env }
      );
      assert.ok(
        readFileSync(destination, "utf8")
          .split("\n")
          .includes(
            `NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS=${JSON.stringify(expected)}`
          )
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("notification recipient policy rejects malformed domains without echoing them", () => {
  for (const domains of [
    "*",
    "https://example.test",
    "example.test,",
    "example.test\nDO_NOT_ECHO",
    "user@example.test",
  ]) {
    const directory = mkdtempSync(
      join(tmpdir(), "notification-policy-rejected-")
    );
    try {
      const { env, config, destination } = fixture(directory);
      const result = spawnSync(
        "python3",
        ["scripts/production/render-env.py", config, destination],
        {
          env: { ...env, NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS: domains },
          encoding: "utf8",
        }
      );
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes("NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS"));
      assert.equal(result.stderr.includes(domains), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
test("partial provider configuration and live Stripe keys in staging fail closed", () => {
  for (const change of [
    { GOOGLE_CLIENT_ID: "fixture" },
    { STORAGE_BUCKET: "fixture" },
    { NEXT_PUBLIC_POSTHOG_HOST: "http://localhost:8000" },
    { SENTRY_DSN: "http://localhost:9000/1" },
    { CAP_SIGNING_KEY: "private-fixture" },
    {
      BILLING_STRIPE_SECRET_KEY: "sk_live_DO_NOT_ECHO",
      BILLING_STRIPE_WEBHOOK_SECRET: "whsec_fixture",
      BILLING_STRIPE_PRICE_ID: "price_fixture",
      BILLING_CHECKOUT_SUCCESS_URL: "https://example.test/success",
      BILLING_CHECKOUT_CANCEL_URL: "https://example.test/cancel",
    },
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "integration-rejected-"));
    try {
      const { env, config, destination } = fixture(directory);
      const result = spawnSync(
        "python3",
        ["scripts/production/render-env.py", config, destination],
        {
          env: { ...env, ...change },
          encoding: "utf8",
        }
      );
      assert.notEqual(result.status, 0);
      assert.equal(result.stderr.includes("DO_NOT_ECHO"), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("runtime missing staging Sentry never selects production", () => {
  const directory = mkdtempSync(join(tmpdir(), "sentry-isolation-"));
  try {
    const { env, config, destination } = fixture(directory);
    env.SENTRY_DSN_STAGING = undefined;
    env.SENTRY_DSN_PRODUCTION = "https://prod@example.test/2";
    execFileSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      { env }
    );
    const rendered = readFileSync(destination, "utf8");
    assert.ok(rendered.includes('SENTRY_DSN_API=""'));
    assert.ok(rendered.includes('SENTRY_DSN_WORKER=""'));
    assert.equal(rendered.includes("https://prod@example.test/2"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
