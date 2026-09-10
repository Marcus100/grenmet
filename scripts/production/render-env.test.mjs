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
        SENTRY_DSN: "https://public@example.test/1",
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
      assert.equal(api.SENTRY_DSN, env.SENTRY_DSN);
      assert.equal(api.REDIS_URL, "redis://redis:6379/0");
      assert.equal(api.EMAIL_RENDER_URL, "http://web-auth:3000");
      assert.equal(
        model.services.worker.environment.SENTRY_DSN,
        env.SENTRY_DSN
      );
      assert.equal(
        model.services["web-gms"].environment.CAP_API_URL,
        "http://api:8000"
      );
      assert.equal(
        model.services["web-gms"].environment.WXPRODUCTS_API_URL,
        "http://web-admin:3001"
      );
      assert.equal(
        model.services["web-auth"].environment.EMAIL_RENDER_SECRET,
        env.EMAIL_RENDER_SECRET
      );
      for (const service of ["web-auth", "web-admin", "web-docs", "web-gms"]) {
        assert.equal(
          model.services[service].environment.NEXT_PUBLIC_POSTHOG_KEY,
          env.NEXT_PUBLIC_POSTHOG_KEY
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
