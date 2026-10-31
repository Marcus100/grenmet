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

// A well-formed (not real) htpasswd bcrypt line, as `htpasswd -nbB` prints it.
const HTPASSWD_ENTRY = (user) => `${user}:$2y$05$${"a".repeat(53)}`;

function fixture(directory) {
  const env = {
    ...process.env,
    CORE_POSTGRES_IMAGE: `postgres:17@sha256:${"a".repeat(64)}`,
    CORE_REDIS_IMAGE: `redis:7-alpine@sha256:${"b".repeat(64)}`,
    CORE_PRIVATE_IP: "10.10.0.2",
    DEPLOY_IMAGE_TAG: `sha-${"a".repeat(40)}`,
  };
  env.NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS = undefined;
  env.AUTH_PRIVILEGED_MFA_MODE = undefined;
  env.AUTH_TOTP_ENCRYPTION_KEYS = undefined;
  env.ORG_SECRET_ENCRYPTION_KEYS = undefined;
  env.PAYMENTS_STRIPE_SECRET_KEY = undefined;
  for (const key of [
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "FASTAPI_DB_PASSWORD",
    "SECRET_KEY",
    "FIRST_SUPERUSER",
    "FIRST_SUPERUSER_PASSWORD",
    "GAA_ADMIN_SSO_CLIENT_SECRET",
    "CMS_SSO_CLIENT_SECRET",
    "TRUSTED_WEB_SECRET",
    "RESEND_API_KEY",
    "EMAIL",
    "USERNAME",
    "HASHED_PASSWORD",
    "PAYLOAD_SECRET",
  ])
    env[key] = `test-only-configuration-value-32-characters-${key}`;
  env.STAGING_BASIC_AUTH_USERS = HTPASSWD_ENTRY("reviewer");
  env.ADMINER_BASIC_AUTH_USERS = HTPASSWD_ENTRY("dba");
  const lines = ["FASTAPI_DB_USER=app_runtime", "ENVIRONMENT=staging"];
  for (const domain of [
    "WXWATCH",
    "WXPRODUCTS",
    "EREGISTER",
    "TRANSPORT",
    "JANITORIAL",
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
        AUTH_PRIVILEGED_MFA_MODE: "enforce",
        AUTH_TOTP_ENCRYPTION_KEYS: JSON.stringify([
          `${Buffer.alloc(32, 3).toString("base64url")}=`,
        ]),
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
      for (const service of ["api", "worker", "prestart"]) {
        assert.equal(
          model.services[service].environment.AUTH_PRIVILEGED_MFA_MODE,
          "enforce"
        );
        assert.deepEqual(
          JSON.parse(
            model.services[service].environment.AUTH_TOTP_ENCRYPTION_KEYS
          ),
          JSON.parse(env.AUTH_TOTP_ENCRYPTION_KEYS)
        );
      }
      for (const [name, service] of Object.entries(model.services)) {
        if (name.startsWith("web-"))
          assert.equal(
            service.environment.AUTH_TOTP_ENCRYPTION_KEYS,
            undefined
          );
      }
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
      // Events lives in the main database (ADR-0003): no separate database.
      assert.equal(
        model.services.api.environment.EVENTS_DATABASE_URL,
        undefined
      );
      assert.equal(
        model.services.prestart.environment.EVENTS_DATABASE_URL,
        undefined
      );
      assert.equal(model.services.db.environment.EVENTS_DB_PASSWORD, undefined);
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
          `https://gms.${baseDomain}`
        );
        assert.equal(
          service.NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS,
          deploymentEnvironment === "staging" ? "barrels.gd" : ""
        );
      }
      for (const [key, subdomain] of Object.entries({
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
      // Admin host move (docs/deployment.md): admin.* is the Barrels console and
      // gms.* the GMS/GAA portal in both environments.
      const suffix = deploymentEnvironment === "staging" ? "-staging" : "";
      const portalUrl = `https://gms.${baseDomain}`;
      assert.equal(
        model.services["web-auth"].environment.ADMIN_APP_URL,
        portalUrl
      );
      assert.equal(
        model.services["web-auth"].environment.BARRELS_ADMIN_APP_URL,
        `https://admin.${baseDomain}`
      );
      assert.equal(api.GAA_ADMIN_APP_URL, portalUrl);
      assert.equal(api.BARRELS_ADMIN_APP_URL, `https://admin.${baseDomain}`);
      assert.equal(
        api.BARRELS_ADMIN_SSO_CLIENT_SECRET,
        model.services["web-admin"].environment.BARRELS_ADMIN_SSO_CLIENT_SECRET
      );
      const adminLabels = model.services["web-admin"].labels;
      const portalLabels = model.services["web-gmsadmin"].labels;
      assert.equal(
        adminLabels[`traefik.http.routers.web-barrels-admin${suffix}.rule`],
        `Host(\`admin.${baseDomain}\`)`
      );
      assert.equal(
        adminLabels[
          `traefik.http.services.web-barrels-admin${suffix}.loadbalancer.server.port`
        ],
        "3012"
      );
      assert.equal(
        portalLabels[`traefik.http.routers.web-gms-portal${suffix}.rule`],
        `Host(\`gms.${baseDomain}\`)`
      );
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
test("app single sign-on secrets must differ per app and are never echoed", () => {
  const directory = mkdtempSync(join(tmpdir(), "sso-secret-shared-"));
  try {
    const { env, config, destination } = fixture(directory);
    const shared = "shared-DO_NOT_ECHO-0123456789abcdefghijklmnop";
    const result = spawnSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      {
        env: {
          ...env,
          GAA_ADMIN_SSO_CLIENT_SECRET: shared,
          BARRELS_ADMIN_SSO_CLIENT_SECRET: shared,
        },
        encoding: "utf8",
      }
    );
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("different per app"));
    assert.equal(result.stderr.includes("DO_NOT_ECHO"), false);
    const ok = spawnSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      {
        env: {
          ...env,
          BARRELS_ADMIN_SSO_CLIENT_SECRET: `${shared}-different`,
        },
        encoding: "utf8",
      }
    );
    assert.equal(ok.status, 0, ok.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("partial provider configuration and live Stripe keys in staging fail closed", () => {
  for (const change of [
    { GOOGLE_CLIENT_ID: "fixture" },
    { STORAGE_BUCKET: "fixture" },
    { NEXT_PUBLIC_POSTHOG_HOST: "http://localhost:8000" },
    { SENTRY_DSN: "http://localhost:9000/1" },
    { CAP_SIGNING_KEY: "private-fixture" },
    { EVENTS_SSO_CLIENT_SECRET: "short-DO_NOT_ECHO" },
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

test("privileged MFA runtime defaults safely and carries a separate rotation key list", () => {
  const directory = mkdtempSync(join(tmpdir(), "delivery-mfa-"));
  try {
    const { env, config, destination } = fixture(directory);
    execFileSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      { env }
    );
    assert.ok(
      readFileSync(destination, "utf8").includes(
        'AUTH_PRIVILEGED_MFA_MODE="disabled"'
      )
    );
    assert.ok(
      readFileSync(destination, "utf8").includes(
        'AUTH_TOTP_ENCRYPTION_KEYS="[]"'
      )
    );
    const keys = [
      `${Buffer.alloc(32, 1).toString("base64url")}=`,
      `${Buffer.alloc(32, 2).toString("base64url")}=`,
    ];
    const encryptedDestination = join(directory, "encrypted-runtime.txt");
    execFileSync(
      "python3",
      ["scripts/production/render-env.py", config, encryptedDestination],
      {
        env: {
          ...env,
          AUTH_PRIVILEGED_MFA_MODE: "enforce",
          AUTH_TOTP_ENCRYPTION_KEYS: JSON.stringify(keys),
        },
      }
    );
    const output = readFileSync(encryptedDestination, "utf8");
    const keyLine = output
      .split("\n")
      .find((line) => line.startsWith("AUTH_TOTP_ENCRYPTION_KEYS="));
    assert.deepEqual(
      JSON.parse(
        JSON.parse(keyLine.slice("AUTH_TOTP_ENCRYPTION_KEYS=".length))
      ),
      keys
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("privileged MFA rejects invalid mode, missing keys and malformed key arrays without exposing values", () => {
  for (const change of [
    { AUTH_PRIVILEGED_MFA_MODE: "DO-NOT-ECHO" },
    { AUTH_PRIVILEGED_MFA_MODE: "enforce", AUTH_TOTP_ENCRYPTION_KEYS: "[]" },
    { AUTH_TOTP_ENCRYPTION_KEYS: "DO-NOT-ECHO" },
    { AUTH_TOTP_ENCRYPTION_KEYS: JSON.stringify(["DO-NOT-ECHO"]) },
    { AUTH_TOTP_ENCRYPTION_KEYS: JSON.stringify([123]) },
    { AUTH_TOTP_ENCRYPTION_KEYS: JSON.stringify("DO-NOT-ECHO") },
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "delivery-mfa-invalid-"));
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

function render(change = {}) {
  const directory = mkdtempSync(join(tmpdir(), "delivery-org-keys-"));
  try {
    const { env, config, destination } = fixture(directory);
    const result = spawnSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      { env: { ...env, ...change }, encoding: "utf8" }
    );
    return {
      result,
      output: result.status === 0 ? readFileSync(destination, "utf8") : "",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const ORG_KEYS_NAME = /ORG_SECRET_ENCRYPTION_KEYS/;
const GENERATED_LINE = (output, name) =>
  output.split("\n").find((line) => line.startsWith(`${name}=`));

test("organisation secret keys render as a JSON array and default to empty", () => {
  const keys = [
    `${Buffer.alloc(32, 7).toString("base64url")}=`,
    `${Buffer.alloc(32, 8).toString("base64url")}=`,
  ];
  const withKeys = render({ ORG_SECRET_ENCRYPTION_KEYS: JSON.stringify(keys) });
  assert.equal(withKeys.result.status, 0, withKeys.result.stderr);
  assert.deepEqual(
    JSON.parse(
      JSON.parse(
        GENERATED_LINE(withKeys.output, "ORG_SECRET_ENCRYPTION_KEYS").slice(
          "ORG_SECRET_ENCRYPTION_KEYS=".length
        )
      )
    ),
    keys
  );
  const without = render();
  assert.equal(without.result.status, 0, without.result.stderr);
  assert.equal(
    GENERATED_LINE(without.output, "ORG_SECRET_ENCRYPTION_KEYS"),
    'ORG_SECRET_ENCRYPTION_KEYS="[]"'
  );
});

test("malformed organisation secret keys are rejected without echoing values", () => {
  for (const value of [
    "DO-NOT-ECHO",
    JSON.stringify(["DO-NOT-ECHO"]),
    JSON.stringify([123]),
    JSON.stringify("DO-NOT-ECHO"),
  ]) {
    const { result } = render({ ORG_SECRET_ENCRYPTION_KEYS: value });
    assert.notEqual(result.status, 0, value);
    assert.match(result.stderr, ORG_KEYS_NAME);
    assert.equal(result.stderr.includes("DO-NOT-ECHO"), false);
  }
});

test("the payments Stripe key must be a test key and is otherwise optional", () => {
  const live = render({ PAYMENTS_STRIPE_SECRET_KEY: "sk_live_DO-NOT-ECHO" });
  assert.notEqual(live.result.status, 0);
  assert.equal(live.result.stderr.includes("DO-NOT-ECHO"), false);
  const restricted = render({
    PAYMENTS_STRIPE_SECRET_KEY: "rk_test_DO-NOT-ECHO",
  });
  assert.notEqual(restricted.result.status, 0);
  assert.equal(restricted.result.stderr.includes("DO-NOT-ECHO"), false);

  const test_ = render({
    PAYMENTS_STRIPE_SECRET_KEY: "sk_test_fixture",
    PAYMENTS_STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    PAYMENTS_STRIPE_SUCCESS_URL: "https://auth.example.test/?paid=1",
    PAYMENTS_STRIPE_CANCEL_URL: "https://auth.example.test/?paid=0",
  });
  assert.equal(test_.result.status, 0, test_.result.stderr);
  assert.equal(
    GENERATED_LINE(test_.output, "PAYMENTS_STRIPE_SECRET_KEY"),
    'PAYMENTS_STRIPE_SECRET_KEY="sk_test_fixture"'
  );
  const unset = render();
  assert.equal(unset.result.status, 0, unset.result.stderr);
  assert.equal(
    GENERATED_LINE(unset.output, "PAYMENTS_STRIPE_SECRET_KEY"),
    'PAYMENTS_STRIPE_SECRET_KEY=""'
  );
});

test("the payments Stripe settings are set together and return over https", () => {
  const full = {
    PAYMENTS_STRIPE_SECRET_KEY: "sk_test_fixture",
    PAYMENTS_STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    PAYMENTS_STRIPE_SUCCESS_URL: "https://auth.example.test/?paid=1",
    PAYMENTS_STRIPE_CANCEL_URL: "https://auth.example.test/?paid=0",
  };
  for (const name of Object.keys(full)) {
    const { [name]: _omitted, ...partial } = full;
    const half = render(partial);
    assert.notEqual(half.result.status, 0, `${name} missing`);
    assert.ok(half.result.stderr.includes("set together"));
    assert.ok(half.result.stderr.includes(name), name);
    assert.equal(half.result.stderr.includes("sk_test_fixture"), false);
  }
  for (const name of [
    "PAYMENTS_STRIPE_SUCCESS_URL",
    "PAYMENTS_STRIPE_CANCEL_URL",
  ]) {
    const insecure = render({ ...full, [name]: "http://auth.example.test/" });
    assert.notEqual(insecure.result.status, 0, name);
    assert.ok(insecure.result.stderr.includes("https"));
  }
});

test("the deploy workflow and compose file pass the new variables to the API and worker", () => {
  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  const compose = readFileSync(
    "infra/docker/docker-compose.deploy.yml",
    "utf8"
  );
  for (const name of [
    "ORG_SECRET_ENCRYPTION_KEYS",
    "PAYMENTS_STRIPE_SECRET_KEY",
    "PAYMENTS_STRIPE_WEBHOOK_SECRET",
    "PAYMENTS_STRIPE_SUCCESS_URL",
    "PAYMENTS_STRIPE_CANCEL_URL",
  ]) {
    assert.ok(workflow.includes(`${name}: \${{`), `${name} in deploy.yml`);
    assert.ok(compose.includes(`${name}: \${${name}`), `${name} in compose`);
  }
  // Secrets come from GitHub secrets, plain settings from variables.
  assert.ok(workflow.includes("secrets.ORG_SECRET_ENCRYPTION_KEYS"));
  assert.ok(workflow.includes("secrets.PAYMENTS_STRIPE_SECRET_KEY"));
  assert.ok(workflow.includes("vars.PAYMENTS_STRIPE_SUCCESS_URL"));
  // The web apps never receive them.
  assert.equal(
    compose
      .split("\n")
      .filter((line) => line.includes("ORG_SECRET_ENCRYPTION_KEYS:")).length,
    4
  );
});

const RENDERED_SECRET = /^TRUSTED_WEB_SECRET=".{32,}"$/m;
const WORKFLOW_PASS =
  /TRUSTED_WEB_SECRET: \$\{\{ secrets\.TRUSTED_WEB_SECRET \}\}/;
const NAMED_SECRET = /TRUSTED_WEB_SECRET/;
const SERVICE_START = /\n(?= {2}[a-z-]+:\n)/;

function renderWith(change) {
  const directory = mkdtempSync(join(tmpdir(), "trusted-web-secret-"));
  try {
    const { env, config, destination } = fixture(directory);
    const result = spawnSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      { env: { ...env, ...change }, encoding: "utf8" }
    );
    return {
      result,
      rendered: result.status === 0 ? readFileSync(destination, "utf8") : "",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function renderFor(environment, change = {}) {
  const directory = mkdtempSync(join(tmpdir(), "delivery-edge-auth-"));
  try {
    const { env, config, destination } = fixture(directory);
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace(
        "ENVIRONMENT=staging",
        `ENVIRONMENT=${environment}`
      )
    );
    const result = spawnSync(
      "python3",
      ["scripts/production/render-env.py", config, destination],
      { env: { ...env, ...change }, encoding: "utf8" }
    );
    return {
      result,
      output: result.status === 0 ? readFileSync(destination, "utf8") : "",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("staging requires its own basic-auth user lists and escapes them for Compose", () => {
  const rendered = renderFor("staging");
  assert.equal(rendered.result.status, 0, rendered.result.stderr);
  // `$` is doubled so Compose passes the bcrypt hash through literally.
  assert.equal(
    GENERATED_LINE(rendered.output, "STAGING_BASIC_AUTH_USERS"),
    `STAGING_BASIC_AUTH_USERS="${HTPASSWD_ENTRY("reviewer").replaceAll("$", "$$$$")}"`
  );
  assert.ok(GENERATED_LINE(rendered.output, "ADMINER_BASIC_AUTH_USERS"));
  for (const name of ["STAGING_BASIC_AUTH_USERS", "ADMINER_BASIC_AUTH_USERS"]) {
    const missing = renderFor("staging", { [name]: "" });
    assert.notEqual(missing.result.status, 0);
    assert.ok(missing.result.stderr.includes(name));
  }
  const several = renderFor("staging", {
    STAGING_BASIC_AUTH_USERS: `${HTPASSWD_ENTRY("a")},${HTPASSWD_ENTRY("b")}`,
  });
  assert.equal(several.result.status, 0, several.result.stderr);
});

test("basic-auth user lists must be bcrypt htpasswd lines and are never echoed", () => {
  for (const value of [
    "DO-NOT-ECHO:plaintext",
    "DO-NOT-ECHO",
    `${HTPASSWD_ENTRY("ok")},DO-NOT-ECHO:$apr1$abc`,
    // Already-doubled dollars: render-env does the Compose escaping itself.
    `DO-NOT-ECHO:$$2y$$05$$${"a".repeat(53)}`,
  ]) {
    const { result } = renderFor("staging", {
      STAGING_BASIC_AUTH_USERS: value,
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes("DO-NOT-ECHO"), false);
  }
});

test("production never receives the staging basic-auth user lists", () => {
  const rendered = renderFor("production", {
    STAGING_BASIC_AUTH_USERS: HTPASSWD_ENTRY("reviewer"),
  });
  assert.equal(rendered.result.status, 0, rendered.result.stderr);
  for (const name of ["STAGING_BASIC_AUTH_USERS", "ADMINER_BASIC_AUTH_USERS"])
    assert.equal(GENERATED_LINE(rendered.output, name), `${name}=""`);
  const unset = renderFor("production", {
    STAGING_BASIC_AUTH_USERS: "",
    ADMINER_BASIC_AUTH_USERS: "",
  });
  assert.equal(unset.result.status, 0, unset.result.stderr);
});

test("TRUSTED_WEB_SECRET is required, at least 32 characters and distinct, without echoing it", () => {
  const ok = renderWith({});
  assert.equal(ok.result.status, 0, ok.result.stderr);
  assert.match(ok.rendered, RENDERED_SECRET);
  for (const change of [
    { TRUSTED_WEB_SECRET: "" },
    { TRUSTED_WEB_SECRET: "short-DO_NOT_ECHO" },
    {
      TRUSTED_WEB_SECRET:
        "test-only-configuration-value-32-characters-SECRET_KEY",
    },
    {
      TRUSTED_WEB_SECRET:
        "test-only-configuration-value-32-characters-CMS_SSO_CLIENT_SECRET",
    },
  ]) {
    const { result } = renderWith(change);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, NAMED_SECRET);
    assert.equal(result.stderr.includes("DO_NOT_ECHO"), false);
    assert.equal(result.stderr.includes("test-only-configuration"), false);
  }
});

test("TRUSTED_WEB_SECRET reaches the API and Events only, from deploy.yml", () => {
  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  const compose = readFileSync(
    "infra/docker/docker-compose.deploy.yml",
    "utf8"
  );
  assert.ok(WORKFLOW_PASS.test(workflow));
  const services = compose.split(SERVICE_START);
  const holders = services
    .filter((block) =>
      block.includes("TRUSTED_WEB_SECRET: ${TRUSTED_WEB_SECRET")
    )
    .map((block) => block.trim().split(":")[0]);
  assert.deepEqual(holders, ["api", "web-events"]);
});

test("the Meta page settings render empty by default and must be numbers", () => {
  const unset = render();
  assert.equal(unset.result.status, 0, unset.result.stderr);
  assert.equal(
    GENERATED_LINE(unset.output, "META_PAGE_ACCESS_TOKEN"),
    'META_PAGE_ACCESS_TOKEN=""'
  );

  const set = render({
    META_PAGE_ID: "1234567890",
    META_INSTAGRAM_ACCOUNT_ID: "17841400000001",
    META_PAGE_ACCESS_TOKEN: "EAAB-DO-NOT-ECHO-fixture",
  });
  assert.equal(set.result.status, 0, set.result.stderr);
  assert.equal(
    GENERATED_LINE(set.output, "META_PAGE_ID"),
    'META_PAGE_ID="1234567890"'
  );
  assert.equal(
    GENERATED_LINE(set.output, "META_INSTAGRAM_ACCOUNT_ID"),
    'META_INSTAGRAM_ACCOUNT_ID="17841400000001"'
  );

  for (const bad of [
    { META_PAGE_ID: "page-one" },
    { META_INSTAGRAM_ACCOUNT_ID: "1234 5678" },
  ]) {
    const refused = render(bad);
    assert.notEqual(refused.result.status, 0, JSON.stringify(bad));
    assert.ok(refused.result.stderr.includes("numbers only"));
    assert.equal(refused.result.stderr.includes("DO-NOT-ECHO"), false);
  }
});

test("the deploy workflow and compose pass the Meta settings to the worker only", () => {
  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  const compose = readFileSync(
    "infra/docker/docker-compose.deploy.yml",
    "utf8"
  );
  // GitHub and Compose placeholders start with a dollar sign. Built from a constant
  // so the linter does not read the test strings as template placeholders.
  const DOLLAR = "$";
  assert.ok(
    workflow.includes(
      `META_PAGE_ACCESS_TOKEN: ${DOLLAR}{{ secrets.META_PAGE_ACCESS_TOKEN }}`
    )
  );
  assert.ok(
    workflow.includes(`META_PAGE_ID: ${DOLLAR}{{ vars.META_PAGE_ID }}`)
  );
  assert.ok(
    workflow.includes(
      `META_INSTAGRAM_ACCOUNT_ID: ${DOLLAR}{{ vars.META_INSTAGRAM_ACCOUNT_ID }}`
    )
  );
  // Only the worker posts. The token is in one service's environment, not two.
  assert.equal(
    compose
      .split("\n")
      .filter((line) => line.includes("META_PAGE_ACCESS_TOKEN:")).length,
    1
  );
  assert.ok(
    compose.includes(
      `META_PAGE_ACCESS_TOKEN: ${DOLLAR}{META_PAGE_ACCESS_TOKEN:-}`
    )
  );
});

test("the approved social hosts render empty by default and reach the API only", () => {
  const unset = render();
  assert.equal(unset.result.status, 0, unset.result.stderr);
  assert.equal(
    GENERATED_LINE(unset.output, "SOCIAL_LINK_HOSTS"),
    'SOCIAL_LINK_HOSTS=""'
  );
  const set = render({
    SOCIAL_LINK_HOSTS: "gms.example.org",
    SOCIAL_IMAGE_HOSTS: "media.example.org",
  });
  assert.equal(set.result.status, 0, set.result.stderr);
  assert.equal(
    GENERATED_LINK_LINE(set.output),
    'SOCIAL_LINK_HOSTS="gms.example.org"'
  );

  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  const compose = readFileSync(
    "infra/docker/docker-compose.deploy.yml",
    "utf8"
  );
  const DOLLAR = "$";
  assert.ok(
    workflow.includes(
      `SOCIAL_LINK_HOSTS: ${DOLLAR}{{ vars.SOCIAL_LINK_HOSTS }}`
    )
  );
  // The hosts are read by the API only: one service's environment, not the worker.
  assert.equal(
    compose.split("\n").filter((line) => line.includes("SOCIAL_LINK_HOSTS:"))
      .length,
    1
  );
});

const GENERATED_LINK_LINE = (output) =>
  GENERATED_LINE(output, "SOCIAL_LINK_HOSTS");
