#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const usage =
  "Usage: node scripts/guardrails/check-blast-radius.mjs --staged | --base <sha> --head <sha>";

const fail = (message) => {
  console.error(`Blast-radius check could not run: ${message}\n${usage}`);
  process.exitCode = 2;
};

const parseArguments = (args) => {
  if (args.length === 1 && args[0] === "--staged") {
    return { mode: "staged" };
  }
  if (
    args.length === 4 &&
    args[0] === "--base" &&
    args[1] &&
    args[2] === "--head" &&
    args[3]
  ) {
    return { base: args[1], head: args[3], mode: "range" };
  }
  return;
};

const parseChanges = (output) => {
  const tokens = output.split("\0");
  const changes = [];

  for (let index = 0; index < tokens.length - 1; ) {
    const status = tokens[index++];
    const firstPath = tokens[index++];
    if (!(status && firstPath)) {
      throw new Error("Git returned an invalid name-status record.");
    }

    if (status.startsWith("R") || status.startsWith("C")) {
      const secondPath = tokens[index++];
      if (!secondPath) {
        throw new Error("Git returned an incomplete rename or copy record.");
      }
      changes.push({ paths: [firstPath, secondPath], status });
    } else {
      changes.push({ paths: [firstPath], status });
    }
  }

  return changes;
};

const fastApiContractFilePattern =
  /^apps\/api\/fastapi\/src\/(?:.+\/)?(?:router|routes|schemas?)\.py$/;
const fastApiContractDirectoryFilePattern =
  /^apps\/api\/fastapi\/src\/(?:.+\/)?(?:routers|schemas?)\/.*\.py$/;

const isFastApiContractFile = (file) =>
  file === "apps/api/fastapi/src/main.py" ||
  fastApiContractFilePattern.test(file) ||
  fastApiContractDirectoryFilePattern.test(file);

const drizzleFamilies = ["janitorial", "transport", "wxproducts", "wxwatch"];

const isDrizzleSchemaFile = (file, family) => {
  const schemaRoot = `apps/web/admin-gms/src/db/${family}/schema`;
  return file === `${schemaRoot}.ts` || file.startsWith(`${schemaRoot}/`);
};

const drizzleMigrationRoot = (family) =>
  `apps/web/admin-gms/drizzle/${family}/`;

const collectChanges = (comparison) => {
  const range =
    comparison.mode === "staged"
      ? ["--cached"]
      : [comparison.base, comparison.head];
  const result = spawnSync(
    "git",
    ["diff", "--name-status", "-z", "--find-renames", ...range, "--"],
    { encoding: "utf8" }
  );

  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ?? result.stderr.trim() ?? "unknown error";
    throw new Error(
      `Git could not compare the requested changes (${detail}). Fetch the base and head commits, then retry the command.`
    );
  }

  return parseChanges(result.stdout);
};

const evaluateChanges = (changes) => {
  const files = new Set(changes.flatMap((change) => change.paths));
  const triggers = [...files].filter(isFastApiContractFile).sort();
  const violations = [];
  const generatedClientChanged = [...files].some((file) =>
    file.startsWith("packages/api-client/src/gen/")
  );
  const missingContractCompanions = [];

  if (triggers.length > 0 && !files.has("apps/api/fastapi/openapi.json")) {
    missingContractCompanions.push("apps/api/fastapi/openapi.json");
  }
  if (triggers.length > 0 && !generatedClientChanged) {
    missingContractCompanions.push("packages/api-client/src/gen/");
  }
  if (triggers.length > 0 && !files.has("docs/api/contracts.md")) {
    missingContractCompanions.push("docs/api/contracts.md");
  }
  if (missingContractCompanions.length > 0) {
    violations.push({
      missing: missingContractCompanions,
      resolution:
        "Regenerate the committed OpenAPI document, run pnpm generate:api-client, and update the API contract documentation.",
      rule: "FastAPI contract companions",
      triggers,
    });
  }

  if (
    triggers.length === 0 &&
    files.has("apps/api/fastapi/openapi.json") &&
    !generatedClientChanged
  ) {
    violations.push({
      missing: ["packages/api-client/src/gen/"],
      resolution:
        "Run pnpm generate:api-client and commit the generated files.",
      rule: "OpenAPI-to-client sync",
      triggers: ["apps/api/fastapi/openapi.json"],
    });
  }

  for (const family of drizzleFamilies) {
    const schemaTriggers = [...files]
      .filter((file) => isDrizzleSchemaFile(file, family))
      .sort();
    const migrationRoot = drizzleMigrationRoot(family);
    if (
      schemaTriggers.length > 0 &&
      ![...files].some((file) => file.startsWith(migrationRoot))
    ) {
      violations.push({
        missing: [migrationRoot],
        resolution: `Run pnpm db:${family}:generate from apps/web/admin-gms and commit the generated migration.`,
        rule: `Drizzle ${family} migration`,
        triggers: schemaTriggers,
      });
    }
  }

  return violations;
};

const reportConsumerValidation = (changes) => {
  const files = new Set(changes.flatMap((change) => change.paths));
  const ciGates = "pnpm type-check, pnpm test, and pnpm build";

  if ([...files].some((file) => file.startsWith("packages/auth/"))) {
    console.log(
      `Auth consumer validation required: validate auth, admin-gms, hurricaneplan, spicewx, signal, including hurricaneplan and spicewx delegation via AUTH_API_URL. CI enforces ${ciGates}.`
    );
  }

  if ([...files].some((file) => file.startsWith("packages/ui/"))) {
    console.log(
      `Shared UI consumer validation required: validate every importing app. CI enforces ${ciGates}.`
    );
  }

  if (
    [...files].some((file) =>
      file.startsWith("apps/web/admin-gms/src/app/(admin)/")
    )
  ) {
    console.log(
      `Admin route validation required: validate cap, hr, wxwatch, wxproducts, and salesbus. CI enforces ${ciGates}.`
    );
  }

  if (
    [...files].some((file) =>
      drizzleFamilies.some((family) => isDrizzleSchemaFile(file, family))
    )
  ) {
    console.log(
      "Drizzle production validation required: validate the generated migration through the web-migrate production service and against the wxwatch and wxproducts databases."
    );
  }
};

const reportViolations = (violations) => {
  console.error("Blast-radius check failed.");
  for (const violation of violations) {
    console.error(`\nRule: ${violation.rule}`);
    console.error("Triggering files:");
    for (const file of violation.triggers) {
      console.error(`  - ${file}`);
    }
    console.error("Missing companion changes:");
    for (const file of violation.missing) {
      console.error(`  - ${file}`);
    }
    console.error(`Resolve: ${violation.resolution}`);
  }
};

const comparison = parseArguments(process.argv.slice(2));
if (!comparison) {
  fail("choose exactly one comparison mode and provide every required value.");
} else if (
  comparison.mode === "staged" &&
  process.env.SKIP_BLAST_RADIUS === "1"
) {
  console.log("Local staged blast-radius check skipped (SKIP_BLAST_RADIUS=1).");
} else {
  try {
    const changes = collectChanges(comparison);
    reportConsumerValidation(changes);
    const violations = evaluateChanges(changes);
    if (violations.length > 0) {
      reportViolations(violations);
      process.exitCode = 1;
    } else {
      console.log("Blast-radius check passed.");
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
