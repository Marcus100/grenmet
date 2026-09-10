import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const ENVIRONMENTS = new Set(["development", "staging", "production"]);

export function providerChecks(env) {
  const posthogSupported =
    !env.NEXT_PUBLIC_POSTHOG_HOST ||
    ["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(
      env.NEXT_PUBLIC_POSTHOG_HOST
    );
  const posthogHost =
    env.NEXT_PUBLIC_POSTHOG_HOST === "https://eu.i.posthog.com"
      ? "https://eu.posthog.com"
      : "https://us.posthog.com";
  return [
    {
      name: "Sentry",
      keys: ["SENTRY_READ_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"],
      url: `https://sentry.io/api/0/projects/${encodeURIComponent(env.SENTRY_ORG ?? "")}/${encodeURIComponent(env.SENTRY_PROJECT ?? "")}/`,
      token: "SENTRY_READ_TOKEN",
    },
    {
      name: "PostHog",
      supported: posthogSupported,
      keys: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"],
      url: `${posthogHost}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID ?? "")}/`,
      token: "POSTHOG_PERSONAL_API_KEY",
    },
    {
      name: "Google Analytics",
      keys: ["GOOGLE_ANALYTICS_ACCESS_TOKEN", "GOOGLE_ANALYTICS_PROPERTY_ID"],
      url: `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(env.GOOGLE_ANALYTICS_PROPERTY_ID ?? "")}/metadata`,
      token: "GOOGLE_ANALYTICS_ACCESS_TOKEN",
    },
    {
      name: "Cloudflare",
      keys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"],
      url: `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(env.CLOUDFLARE_ZONE_ID ?? "")}`,
      token: "CLOUDFLARE_API_TOKEN",
    },
    {
      name: "DigitalOcean",
      keys: ["DIGITALOCEAN_ACCESS_TOKEN"],
      url: "https://api.digitalocean.com/v2/account",
      token: "DIGITALOCEAN_ACCESS_TOKEN",
    },
    {
      name: "Resend",
      keys: ["RESEND_READ_TOKEN"],
      url: "https://api.resend.com/domains",
      token: "RESEND_READ_TOKEN",
    },
  ];
}

/** Responses and credentials are deliberately excluded from reports. */
export async function checkProviders(
  env,
  { live = false, fetcher = fetch } = {}
) {
  const reports = [];
  for (const provider of providerChecks(env)) {
    if (provider.supported === false) {
      reports.push({ provider: provider.name, status: "unsupported-host" });
      continue;
    }
    const missing = provider.keys.filter((key) => !env[key]);
    if (missing.length) {
      reports.push({ provider: provider.name, status: "missing", missing });
      continue;
    }
    if (!live) {
      reports.push({
        provider: provider.name,
        status: "configured-unverified",
      });
      continue;
    }
    try {
      const response = await fetcher(provider.url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${env[provider.token]}`,
          Accept: "application/json",
        },
      });
      await response.body?.cancel();
      reports.push({
        provider: provider.name,
        status: response.ok ? "read-access-verified" : "failed",
        httpStatus: response.status,
      });
    } catch {
      reports.push({ provider: provider.name, status: "request-failed" });
    }
  }
  return reports;
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      environment: { type: "string" },
      "env-file": { type: "string" },
      live: { type: "boolean", default: false },
    },
  });
  if (!ENVIRONMENTS.has(values.environment))
    throw new Error("Use --environment development, staging or production.");
  const env = values["env-file"]
    ? parseEnv(readFileSync(values["env-file"], "utf8"))
    : process.env;
  // An explicit file is isolated from ambient credentials to avoid crossing environments.
  if (env.INTEGRATION_ENVIRONMENT !== values.environment)
    throw new Error("INTEGRATION_ENVIRONMENT must match --environment.");
  const providers = await checkProviders(env, { live: values.live });
  console.log(
    JSON.stringify({ environment: values.environment, providers }, null, 2)
  );
  if (
    providers.some(
      (p) =>
        p.status === "failed" ||
        p.status === "request-failed" ||
        p.status === "missing" ||
        p.status === "unsupported-host"
    )
  )
    process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      "Integration check failed. Check the environment selection and credential file; secret values are never printed."
    );
    process.exitCode = 1;
  });
}
