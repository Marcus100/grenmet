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
