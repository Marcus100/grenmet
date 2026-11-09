#!/usr/bin/env node
// Compare GitHub environment secret and variable NAMES with the checked-in
// manifest (issue #1146). Values are never requested: the GitHub API only
// returns names and dates for these lists, and this script reads names only.
//
//   node scripts/ci/check-environment-settings.mjs [--repo owner/name] [--json]
//
// Exits 1 when a required name is missing, an unlisted name is present, or the
// manifest is invalid. Names listed under `pending` are known drift: tolerated
// either way and printed on every run until someone resolves them.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const KINDS = ["secrets", "variables"];
const NAME = /^[A-Z][A-Z0-9_]*$/u;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/u;
const ENVIRONMENT = /^[\w.-]+$/u;
const MANIFEST = fileURLToPath(
  new URL("./environment-settings.json", import.meta.url)
);

function namesOf(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return Object.keys(value ?? {});
}

/** Names for one environment and kind, each with the section listing it. */
function listedNames(manifest, environment, kind) {
  return [
    ["shared", manifest.shared?.[kind]],
    ["only", manifest.only?.[environment]?.[kind]],
    ["pending", manifest.pending?.[environment]?.[kind]],
  ].flatMap(([section, names]) =>
    namesOf(names).map((name) => ({ section, name }))
  );
}

function nameErrors(manifest, environment, kind) {
  const errors = [];
  const seen = new Map();
  for (const { section, name } of listedNames(manifest, environment, kind)) {
    const label = `${environment} ${kind}: ${name}`;
    if (!NAME.test(name)) {
      errors.push(`${label} is not a valid name`);
    }
    if (seen.has(name)) {
      errors.push(
        `${label} is listed in both ${seen.get(name)} and ${section}`
      );
    }
    seen.set(name, section);
  }
  return errors;
}

/** Every structural problem in the manifest, as readable strings. */
export function validateManifest(manifest) {
  const environments = manifest.environments ?? [];
  const errors =
    environments.length === 0
      ? ["environments must list at least one environment"]
      : [];
  for (const section of ["only", "pending"]) {
    for (const environment of Object.keys(manifest[section] ?? {})) {
      if (!environments.includes(environment)) {
        errors.push(`${section}.${environment} is not a listed environment`);
      }
    }
  }
  for (const environment of environments) {
    for (const kind of KINDS) {
      errors.push(...nameErrors(manifest, environment, kind));
    }
  }
  return errors;
}

/**
 * Compare one environment's actual names with the manifest.
 * `actual` is `{ secrets: string[], variables: string[] }`.
 */
export function compareEnvironment(manifest, environment, actual) {
  const missing = [];
  const unexpected = [];
  const pending = [];
  for (const kind of KINDS) {
    const present = new Set(actual[kind] ?? []);
    const required = new Set([
      ...namesOf(manifest.shared?.[kind]),
      ...namesOf(manifest.only?.[environment]?.[kind]),
    ]);
    const tolerated = manifest.pending?.[environment]?.[kind] ?? {};
    for (const name of [...required].sort()) {
      if (!present.has(name)) {
        missing.push({ kind, name });
      }
    }
    for (const name of [...present].sort()) {
      if (!(required.has(name) || Object.hasOwn(tolerated, name))) {
        unexpected.push({ kind, name });
      }
    }
    for (const name of Object.keys(tolerated).sort()) {
      pending.push({
        kind,
        name,
        present: present.has(name),
        reason: tolerated[name],
      });
    }
  }
  return { environment, missing, unexpected, pending };
}

/** A plain-text report and whether the comparison passed. */
export function formatReport(results) {
  const lines = [];
  let ok = true;
  for (const { environment, missing, unexpected, pending } of results) {
    lines.push(`${environment}:`);
    for (const { kind, name } of missing) {
      ok = false;
      lines.push(`  MISSING    ${kind.slice(0, -1)} ${name}`);
    }
    for (const { kind, name } of unexpected) {
      ok = false;
      lines.push(
        `  UNEXPECTED ${kind.slice(0, -1)} ${name} (add it to the manifest with a reason, or remove it)`
      );
    }
    for (const { kind, name, present, reason } of pending) {
      lines.push(
        `  pending    ${kind.slice(0, -1)} ${name} (${present ? "present" : "absent"}): ${reason}`
      );
    }
    if (missing.length === 0 && unexpected.length === 0) {
      lines.push("  matches the manifest");
    }
  }
  return { ok, text: lines.join("\n") };
}

function ghNames(repository, environment, kind) {
  const output = execFileSync(
    "gh",
    [
      "api",
      "--paginate",
      `repos/${repository}/environments/${environment}/${kind}?per_page=100`,
      "--jq",
      `.${kind}[].name`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return output.split("\n").filter(Boolean);
}

export function run(
  argv,
  {
    names = ghNames,
    log = console.log,
    readManifest = (path) => JSON.parse(readFileSync(path, "utf8")),
    env = process.env,
  } = {}
) {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: "string" },
      manifest: { type: "string" },
      json: { type: "boolean" },
    },
  });
  const repository =
    values.repo ?? env.GITHUB_REPOSITORY ?? "Marcus100/grenmet";
  if (!REPOSITORY.test(repository)) {
    throw new Error(`Invalid repository: ${repository}`);
  }
  const manifest = readManifest(values.manifest ?? MANIFEST);
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    log(`Invalid manifest:\n  ${errors.join("\n  ")}`);
    return 1;
  }
  const results = manifest.environments.map((environment) => {
    if (!ENVIRONMENT.test(environment)) {
      throw new Error(`Invalid environment name: ${environment}`);
    }
    const actual = Object.fromEntries(
      KINDS.map((kind) => [kind, names(repository, environment, kind)])
    );
    return compareEnvironment(manifest, environment, actual);
  });
  const report = formatReport(results);
  log(values.json ? JSON.stringify(results, null, 2) : report.text);
  return report.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
