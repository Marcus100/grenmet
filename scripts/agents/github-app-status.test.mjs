import assert from "node:assert/strict";
import { generateKeyPairSync, verify as verifySignature } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  API,
  createAppJwt,
  createGitHubAppStatusPublisher,
  getGitHubAppBotLogin,
  loadStatusAppConfig,
  publishReviewStatus,
  REPOSITORY,
  STATUS_CONTEXTS,
} from "./github-app-status.mjs";

const APP_ID = "123456";
const INSTALLATION_ID = "789012";
const HEAD = "a".repeat(40);
const NOW = Date.parse("2026-10-25T13:00:00.000Z");
const OUTSIDE_REPOSITORY = /outside the repository/u;
const PRIVATE_FILE_MODE = /mode 0600/u;
const STATUS_PERMISSION = /status permission/u;
const UNKNOWN_STATUS = /unrecognized review status/u;
const APP_ID_MISMATCH = /does not match the protected ruleset/u;
const APP_IDENTITY_MISMATCH = /could not verify the configured status App/u;
const BEARER_JWT = /^Bearer eyJ/u;

function keyFixture() {
  const parent = mkdtempSync(join(tmpdir(), "grenmet-status-app-test-"));
  const repoRoot = join(parent, "repo");
  const privateKeyPath = join(parent, "review-status-app.pem");
  mkdirSync(repoRoot);
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(
    privateKeyPath,
    pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    { mode: 0o600 }
  );
  chmodSync(privateKeyPath, 0o600);
  return {
    parent,
    repoRoot,
    privateKeyPath,
    publicKey: pair.publicKey,
    env: {
      GRENMET_REVIEW_STATUS_APP_ID: APP_ID,
      GRENMET_REVIEW_STATUS_INSTALLATION_ID: INSTALLATION_ID,
      GRENMET_REVIEW_STATUS_APP_PRIVATE_KEY_FILE: privateKeyPath,
    },
  };
}

function ok(body, status = 201) {
  return { ok: true, status, json: async () => body };
}

const status = {
  head: HEAD,
  context: "Factory review",
  state: "success",
  description: `base=${"b".repeat(40)};scope=code`,
  number: 588,
};

test("loads only a private App key outside the repository", () => {
  const fixture = keyFixture();
  try {
    const config = loadStatusAppConfig(fixture);
    assert.equal(config.appId, APP_ID);
    assert.equal(config.installationId, INSTALLATION_ID);
    assert.equal(config.privateKey.type, "private");
    assert.throws(
      () =>
        loadStatusAppConfig({
          ...fixture,
          env: {
            ...fixture.env,
            GRENMET_REVIEW_STATUS_APP_PRIVATE_KEY_FILE: fixture.privateKeyPath,
          },
          repoRoot: fixture.parent,
        }),
      OUTSIDE_REPOSITORY
    );
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("rejects an App key with group or world permissions", () => {
  const fixture = keyFixture();
  try {
    chmodSync(fixture.privateKeyPath, 0o644);
    assert.throws(() => loadStatusAppConfig(fixture), PRIVATE_FILE_MODE);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("creates a short-lived RS256 App JWT", () => {
  const fixture = keyFixture();
  try {
    const config = loadStatusAppConfig(fixture);
    const jwt = createAppJwt({ ...config, now: NOW });
    const [header, claims, signature] = jwt.split(".");
    const signingInput = `${header}.${claims}`;
    const decodedHeader = JSON.parse(
      Buffer.from(header, "base64url").toString("utf8")
    );
    const decodedClaims = JSON.parse(
      Buffer.from(claims, "base64url").toString("utf8")
    );
    assert.deepEqual(decodedHeader, { alg: "RS256", typ: "JWT" });
    assert.equal(decodedClaims.iss, APP_ID);
    assert.equal(decodedClaims.iat, Math.floor(NOW / 1000) - 30);
    assert.equal(decodedClaims.exp - decodedClaims.iat, 540);
    assert.equal(
      verifySignature(
        "RSA-SHA256",
        Buffer.from(signingInput),
        fixture.publicKey,
        Buffer.from(signature, "base64url")
      ),
      true
    );
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("resolves the bot login from the App authenticated by its private key", async () => {
  const fixture = keyFixture();
  const calls = [];
  try {
    const login = await getGitHubAppBotLogin({
      expectedAppId: APP_ID,
      env: fixture.env,
      repoRoot: fixture.repoRoot,
      fetchImpl: (url, options) => {
        calls.push({ url, options });
        return ok({ id: Number(APP_ID), slug: "grenmet-review-status" }, 200);
      },
      now: () => NOW,
    });
    assert.equal(login, "grenmet-review-status[bot]");
    assert.equal(calls[0].url, `${API}/app`);
    assert.match(calls[0].options.headers.authorization, BEARER_JWT);
    await assert.rejects(
      getGitHubAppBotLogin({
        expectedAppId: APP_ID,
        env: fixture.env,
        repoRoot: fixture.repoRoot,
        fetchImpl: () =>
          ok({ id: Number(INSTALLATION_ID), slug: "other-app" }, 200),
        now: () => NOW,
      }),
      APP_IDENTITY_MISMATCH
    );
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("mints a statuses-only installation token and publishes the review status", async () => {
  const fixture = keyFixture();
  const calls = [];
  let currentTime = NOW;
  const fetchImpl = (url, options) => {
    calls.push({ url, options });
    if (url.endsWith(`/app/installations/${INSTALLATION_ID}/access_tokens`))
      return ok({
        token: "installation-token",
        expires_at: new Date(NOW + 60 * 60_000).toISOString(),
        permissions: { statuses: "write" },
      });
    return ok({
      state: "success",
      context: options.body && JSON.parse(options.body).context,
    });
  };
  try {
    const config = loadStatusAppConfig(fixture);
    const publisher = createGitHubAppStatusPublisher({
      config,
      fetchImpl,
      now: () => currentTime,
    });
    await publisher.publish(status);
    currentTime += 1000;
    await publisher.publish({ ...status, context: "Factory security review" });

    assert.equal(calls.length, 3);
    const [tokenCall, firstStatusCall, secondStatusCall] = calls;
    assert.equal(
      tokenCall.url,
      `${API}/app/installations/${INSTALLATION_ID}/access_tokens`
    );
    assert.match(tokenCall.options.headers.authorization, BEARER_JWT);
    assert.deepEqual(JSON.parse(tokenCall.options.body), {
      permissions: { statuses: "write" },
      repositories: ["grenmet"],
    });
    assert.equal(
      firstStatusCall.url,
      `${API}/repos/${REPOSITORY}/statuses/${HEAD}`
    );
    assert.equal(
      firstStatusCall.options.headers.authorization,
      "Bearer installation-token"
    );
    assert.deepEqual(JSON.parse(firstStatusCall.options.body), {
      context: "Factory review",
      description: status.description,
      state: "success",
      target_url: `https://github.com/${REPOSITORY}/pull/588`,
    });
    assert.equal(
      secondStatusCall.options.headers.authorization,
      "Bearer installation-token"
    );
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("does not publish when the installed App token lacks statuses:write", async () => {
  const fixture = keyFixture();
  const calls = [];
  try {
    const publisher = createGitHubAppStatusPublisher({
      config: loadStatusAppConfig(fixture),
      fetchImpl: (url, options) => {
        calls.push({ url, options });
        return ok({
          token: "read-only-token",
          expires_at: new Date(NOW + 60 * 60_000).toISOString(),
          permissions: { contents: "read" },
        });
      },
      now: () => NOW,
    });
    await assert.rejects(publisher.publish(status), STATUS_PERMISSION);
    assert.equal(calls.length, 1);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("refuses other contexts and rejects an App ID that differs from the ruleset", async () => {
  const fixture = keyFixture();
  try {
    const config = loadStatusAppConfig(fixture);
    const publisher = createGitHubAppStatusPublisher({
      config,
      fetchImpl: () => {
        throw new Error("must not make a request");
      },
      now: () => NOW,
    });
    await assert.rejects(
      publisher.publish({ ...status, context: "CI Success" }),
      UNKNOWN_STATUS
    );
    assert.throws(
      () =>
        publishReviewStatus({
          status,
          expectedAppId: "999999",
          env: fixture.env,
          repoRoot: fixture.repoRoot,
          fetchImpl: () => {
            throw new Error("must not make a request");
          },
        }),
      APP_ID_MISMATCH
    );
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("a required status context is one of the two review contexts", () => {
  assert.equal(STATUS_CONTEXTS.has("Factory review"), true);
  assert.equal(STATUS_CONTEXTS.has("Factory security review"), true);
  assert.equal(STATUS_CONTEXTS.has("CI Success"), false);
});
