import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { analyticsStatus } from "./analytics-status.mjs";

const REPOSITORY = "Marcus100/grenmet";
const ENVIRONMENTS = new Set(["staging", "production"]);
const CORE_SECRETS = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "FASTAPI_DB_PASSWORD",
  "SECRET_KEY",
  "FIRST_SUPERUSER",
  "FIRST_SUPERUSER_PASSWORD",
  "GAA_ADMIN_SSO_CLIENT_SECRET",
  "CMS_SSO_CLIENT_SECRET",
  "RESEND_API_KEY",
  "EMAIL",
  "USERNAME",
  "HASHED_PASSWORD",
  "PAYLOAD_SECRET",
  ...[
    "WXWATCH",
    "WXPRODUCTS",
    "EREGISTER",
    "TRANSPORT",
    "JANITORIAL",
    "EVENTS",
    "CMS",
  ].map((domain) => `${domain}_DB_PASSWORD`),
];

/** Metadata only: never retrieve, accept, or report secret values. */
export function readiness(environment, secretNames, variables) {
  if (!ENVIRONMENTS.has(environment))
    throw new Error("Unknown deployment environment");
  const secrets = new Set(secretNames);
  const has = (name) => secrets.has(name);
  const rows = [];
  const group = (service, required, keys) => {
    const missing = keys
      .filter(([present]) => !present)
      .map(([, name]) => name);
    let status = "configured-unverified";
    if (missing.length)
      status = missing.length === keys.length ? "missing" : "incomplete";
    rows.push({
      service,
      required,
      status,
      missing,
    });
  };
  const secretGroup = (service, required, keys) =>
    group(
      service,
      required,
      keys.map((key) => [has(key), key])
    );
  secretGroup("Core deployment", true, CORE_SECRETS);
  group(
    "Core infrastructure",
    true,
    ["CORE_POSTGRES_IMAGE", "CORE_REDIS_IMAGE", "CORE_PRIVATE_IP"].map(
      (key) => [Boolean(variables[key]), key]
    )
  );
  secretGroup("Google sign-in", false, [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]);
  group(
    "Application storage",
    false,
    [
      ["STORAGE_ENDPOINT_URL", "DO_SPACES_ENDPOINT"],
      ["STORAGE_REGION", "DO_SPACES_REGION"],
      ["STORAGE_BUCKET", "DO_SPACES_BUCKET"],
      ["STORAGE_ACCESS_KEY_ID", "DO_SPACES_ACCESS_KEY_ID"],
      ["STORAGE_SECRET_ACCESS_KEY", "DO_SPACES_SECRET_ACCESS_KEY"],
    ].map(([primary, fallback]) => [
      has(primary) || has(fallback),
      `${primary} or ${fallback}`,
    ])
  );
  secretGroup("Email sending", true, ["RESEND_API_KEY"]);
  secretGroup("Email delivery webhooks", false, ["RESEND_WEBHOOK_SECRET"]);
  secretGroup("Email template rendering", false, ["EMAIL_RENDER_SECRET"]);
  secretGroup("Sentry reporting", false, [
    `SENTRY_DSN_${environment.toUpperCase()}`,
  ]);
  secretGroup("Weather ingestion", false, ["WXWATCH_INGEST_TOKEN"]);
  secretGroup("CAP signing", false, ["CAP_SIGNING_CERT", "CAP_SIGNING_KEY"]);
  group(
    "Stripe billing",
    false,
    [
      "BILLING_STRIPE_SECRET_KEY",
      "BILLING_STRIPE_WEBHOOK_SECRET",
      "BILLING_STRIPE_PRICE_ID",
      "BILLING_CHECKOUT_SUCCESS_URL",
      "BILLING_CHECKOUT_CANCEL_URL",
    ].map((key) => [
      has(key) ||
        (![
          "BILLING_STRIPE_SECRET_KEY",
          "BILLING_STRIPE_WEBHOOK_SECRET",
        ].includes(key) &&
          Boolean(variables[key])),
      key,
    ])
  );
  secretGroup("Worker heartbeat", false, ["WORKER_HEARTBEAT_URL"]);
  for (const [service, flag, keys] of [
    [
      "Host monitoring",
      "MONITORING_DEPLOY_ENABLED",
      ["PROBE_HEARTBEAT_URL", "BETTERSTACK_API_TOKEN"],
    ],
    ["Operational counters", "TELEMETRY_ENABLED", []],
  ]) {
    if (variables[flag] === "true") secretGroup(service, true, keys);
    else
      rows.push({
        service,
        required: false,
        status:
          variables[flag] && variables[flag] !== "false"
            ? "invalid-activation-flag"
            : "disabled",
        missing: [flag],
      });
  }
  return {
    environment,
    scope:
      "GitHub environment configuration only; does not inspect deployed containers, credential validity, provider settings, repository/organisation inheritance or Vercel",
    integrations: rows,
  };
}

export function githubInventory(environment, run = execFileSync) {
  if (!ENVIRONMENTS.has(environment))
    throw new Error("Unknown deployment environment");
  const read = (kind) => {
    const pages = JSON.parse(
      run(
        "gh",
        [
          "api",
          "--paginate",
          "--slurp",
          `repos/${REPOSITORY}/environments/${environment}/${kind}?per_page=100`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 }
      )
    );
    return pages.flatMap((page) => page[kind]);
  };
  return {
    secrets: read("secrets").map((entry) => entry.name),
    variables: Object.fromEntries(
      read("variables").map((entry) => [entry.name, entry.value])
    ),
  };
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      environment: { type: "string" },
      strict: { type: "boolean", default: false },
    },
  });
  if (!ENVIRONMENTS.has(values.environment))
    throw new Error("Use --environment staging or production");
  const inventory = githubInventory(values.environment);
  const report = readiness(
    values.environment,
    inventory.secrets,
    inventory.variables
  );
  report.analytics = analyticsStatus().filter(
    (entry) => entry.environment === values.environment
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    values.strict &&
    report.integrations.some(
      (entry) =>
        (entry.required && entry.status !== "configured-unverified") ||
        entry.status === "incomplete" ||
        entry.status === "invalid-activation-flag"
    )
  )
    process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch {
    console.error(
      "Readiness check failed. Select staging or production and check gh authentication/environment access. Provider output and credentials are not printed."
    );
    process.exitCode = 1;
  }
}
