// Publishes trusted review statuses through a dedicated GitHub App. The review
// worker deliberately does not pass its human GitHub credentials to this child.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const API = "https://api.github.com";
export const REPOSITORY = "Marcus100/grenmet";
export const STATUS_CONTEXTS = new Set([
  "Factory review",
  "Factory security review",
]);
export const PRIVATE_KEY_LIMIT = 64 * 1024;

const SHA = /^[a-f0-9]{40}$/u;
const APP_ID = /^\d+$/u;
const APP_SLUG = /^[a-z0-9-]+$/u;
const MINUTE = 60_000;
const MAX_STATUS_DESCRIPTION = 140;

function isWithin(path, parent) {
  const relativePath = relative(resolve(parent), resolve(path));
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`))
  );
}

export function loadStatusAppConfig({
  env = process.env,
  repoRoot,
  readFile = readFileSync,
  realpath = realpathSync,
  stat = statSync,
}) {
  const appId = env.GRENMET_REVIEW_STATUS_APP_ID;
  const installationId = env.GRENMET_REVIEW_STATUS_INSTALLATION_ID;
  const keyPath = env.GRENMET_REVIEW_STATUS_APP_PRIVATE_KEY_FILE;
  if (!(appId && APP_ID.test(appId)))
    throw new Error("Review-status GitHub App ID is missing or invalid.");
  if (!(installationId && APP_ID.test(installationId)))
    throw new Error(
      "Review-status GitHub App installation ID is missing or invalid."
    );
  if (!(keyPath && isAbsolute(keyPath)))
    throw new Error(
      "Review-status GitHub App private-key path must be absolute."
    );
  let root;
  let privateKeyPath;
  let metadata;
  try {
    root = realpath(repoRoot);
    privateKeyPath = realpath(keyPath);
    metadata = stat(privateKeyPath);
  } catch {
    throw new Error("Review-status GitHub App private key is unavailable.");
  }
  if (isWithin(privateKeyPath, root))
    throw new Error(
      "Review-status GitHub App key must be outside the repository."
    );
  if (!metadata.isFile() || metadata.mode.toString(8).slice(-3) !== "600")
    throw new Error(
      "Review-status GitHub App key must be a private file with mode 0600."
    );
  let privateKey;
  try {
    const contents = readFile(privateKeyPath);
    if (contents.byteLength > PRIVATE_KEY_LIMIT)
      throw new Error("key too large");
    privateKey = createPrivateKey(contents);
  } catch {
    throw new Error("Review-status GitHub App private key is invalid.");
  }
  return { appId, installationId, privateKey };
}

export function createAppJwt({ appId, privateKey, now = Date.now() }) {
  if (!(typeof appId === "string" && APP_ID.test(appId)))
    throw new Error("Review-status GitHub App ID is missing or invalid.");
  const issuedAt = Math.floor(now / 1000) - 30;
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: issuedAt + 540, iat: issuedAt, iss: appId })
  ).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

export async function getGitHubAppBotLogin({
  expectedAppId,
  env = process.env,
  repoRoot,
  fetchImpl = fetch,
  now = Date.now,
}) {
  if (String(env.GRENMET_REVIEW_STATUS_APP_ID ?? "") !== String(expectedAppId))
    throw new Error(
      "Configured status App does not match the protected ruleset."
    );
  const config = loadStatusAppConfig({ env, repoRoot });
  if (config.appId !== String(expectedAppId))
    throw new Error(
      "Configured status App does not match the protected ruleset."
    );
  const app = await requestJson(fetchImpl, "/app", {
    token: createAppJwt({ ...config, now: now() }),
  });
  if (
    String(app.id ?? "") !== config.appId ||
    !(typeof app.slug === "string" && APP_SLUG.test(app.slug))
  )
    throw new Error("GitHub could not verify the configured status App.");
  return `${app.slug}[bot]`;
}

async function requestJson(
  fetchImpl,
  path,
  { token, method = "GET", body } = {}
) {
  let response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("GitHub App status request could not reach GitHub.");
  }
  if (!response.ok)
    throw new Error(
      `GitHub App status request failed with HTTP ${response.status}.`
    );
  try {
    return await response.json();
  } catch {
    throw new Error("GitHub App status request returned invalid JSON.");
  }
}

function validateStatus({ head, context, state, description, number }) {
  if (!(typeof head === "string" && SHA.test(head)))
    throw new Error("Review status head must be a full commit SHA.");
  if (!(typeof context === "string" && STATUS_CONTEXTS.has(context)))
    throw new Error("Refusing to publish an unrecognized review status.");
  if (!new Set(["error", "failure", "pending", "success"]).has(state))
    throw new Error("Review status state is invalid.");
  if (
    !(
      typeof description === "string" &&
      description.length <= MAX_STATUS_DESCRIPTION
    )
  )
    throw new Error("Review status description is invalid.");
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("Review status pull request number is invalid.");
}

export function createGitHubAppStatusPublisher({
  config,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let cachedToken;
  let expiresAt = 0;
  const getInstallationToken = async () => {
    if (cachedToken && now() < expiresAt - 5 * MINUTE) return cachedToken;
    const jwt = createAppJwt({ ...config, now: now() });
    const tokenResponse = await requestJson(
      fetchImpl,
      `/app/installations/${config.installationId}/access_tokens`,
      {
        token: jwt,
        method: "POST",
        body: {
          permissions: { statuses: "write" },
          repositories: ["grenmet"],
        },
      }
    );
    const expiry = Date.parse(tokenResponse.expires_at ?? "");
    if (
      typeof tokenResponse.token !== "string" ||
      tokenResponse.token.length === 0 ||
      !Number.isFinite(expiry) ||
      tokenResponse.permissions?.statuses !== "write"
    )
      throw new Error("GitHub App token lacks the required status permission.");
    cachedToken = tokenResponse.token;
    expiresAt = expiry;
    return cachedToken;
  };

  return {
    async publish(status) {
      validateStatus(status);
      const token = await getInstallationToken();
      return requestJson(
        fetchImpl,
        `/repos/${REPOSITORY}/statuses/${status.head}`,
        {
          token,
          method: "POST",
          body: {
            state: status.state,
            context: status.context,
            description: status.description,
            target_url: `https://github.com/${REPOSITORY}/pull/${status.number}`,
          },
        }
      );
    },
  };
}

export function publishReviewStatus({
  status,
  expectedAppId,
  env = process.env,
  repoRoot,
  fetchImpl = fetch,
  now = Date.now,
}) {
  if (String(env.GRENMET_REVIEW_STATUS_APP_ID ?? "") !== String(expectedAppId))
    throw new Error(
      "Configured status App does not match the protected ruleset."
    );
  const config = loadStatusAppConfig({ env, repoRoot });
  if (config.appId !== String(expectedAppId))
    throw new Error(
      "Configured status App does not match the protected ruleset."
    );
  return createGitHubAppStatusPublisher({ config, fetchImpl, now }).publish(
    status
  );
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const payload = JSON.parse(await readStdin());
    if (payload.action === "identity") {
      const login = await getGitHubAppBotLogin(payload);
      console.log(login);
    } else if (payload.action === "publish") {
      await publishReviewStatus(payload);
      console.log("Review status published by the configured GitHub App.");
    } else {
      throw new Error("Review-status GitHub App action is invalid.");
    }
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Review status publishing failed."
    );
    process.exitCode = 1;
  }
}
