// Snapshot and drift check for the repository's GitHub rulesets.
//
// Rulesets are the only thing that makes "PR required" and "required checks"
// true; the docs merely describe them. `--snapshot` writes the live rulesets,
// normalised, to infra/github/rulesets.json so the repository carries a
// reviewable copy. `--check` (rulesets-drift.yml: every PR into a long-lived
// branch, weekly, and on demand) fails when the live rulesets differ from that
// file, so a settings change nobody wrote down surfaces before a promotion
// relies on it. The repository is public, so reads need no token; one is used
// when present for the rate limit. In a proxied container run with
// NODE_USE_ENV_PROXY=1.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SNAPSHOT_PATH = "infra/github/rulesets.json";
const DEFAULT_REPO = "Marcus100/grenmet";
const API = "https://api.github.com";
// Per-ruleset identity and timestamps change without any rule changing.
const VOLATILE_FIELDS = new Set([
  "_links",
  "created_at",
  "current_user_can_bypass",
  "id",
  "node_id",
  "source",
  "source_type",
  "updated_at",
]);

const byKey = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));

function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !VOLATILE_FIELDS.has(key))
        .sort()
        .map((key) => [key, stripVolatile(value[key])])
    );
  }
  return value;
}

/** Rulesets in a stable shape: sorted, without ids, links or timestamps. */
export function normalize(rulesets) {
  return rulesets
    .map((ruleset) => {
      const clean = stripVolatile(ruleset);
      const rules = (clean.rules ?? []).map((rule) => {
        const checks = rule.parameters?.required_status_checks;
        return checks
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                required_status_checks: [...checks].sort(byKey("context")),
              },
            }
          : rule;
      });
      return { ...clean, rules: rules.sort(byKey("type")) };
    })
    .sort(byKey("name"));
}

/**
 * GitHub returns `bypass_actors` only to callers who can edit rulesets, so the
 * workflow's default token sees the field missing. Compare it only where the
 * live response carries it, and name the rulesets where it was not compared.
 */
export function withoutHiddenBypassActors(expected, actual) {
  const visible = new Map(
    actual.map((ruleset) => [ruleset.name, "bypass_actors" in ruleset])
  );
  const unchecked = [];
  const comparable = expected.map((ruleset) => {
    if (visible.get(ruleset.name) !== false || !("bypass_actors" in ruleset)) {
      return ruleset;
    }
    unchecked.push(ruleset.name);
    const { bypass_actors: _hidden, ...rest } = ruleset;
    return rest;
  });
  return { comparable, unchecked };
}

function flatten(value, path, out) {
  // An empty container is a leaf, except at the root where it means "nothing".
  if (Array.isArray(value)) {
    if (value.length === 0 && path) out.set(path, "[]");
    for (const [index, item] of value.entries()) {
      flatten(item, `${path}[${index}]`, out);
    }
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0 && path) out.set(path, "{}");
    for (const key of keys) {
      flatten(value[key], path ? `${path}.${key}` : key, out);
    }
  } else {
    out.set(path, JSON.stringify(value));
  }
  return out;
}

/** Human-readable differences between two normalised ruleset lists. */
export function diff(expected, actual) {
  const want = flatten(expected, "", new Map());
  const have = flatten(actual, "", new Map());
  const lines = [];
  for (const [path, value] of want) {
    if (!have.has(path)) lines.push(`missing  ${path} = ${value}`);
    else if (have.get(path) !== value) {
      lines.push(`changed  ${path}: ${value} -> ${have.get(path)}`);
    }
  }
  for (const [path, value] of have) {
    if (!want.has(path)) lines.push(`added    ${path} = ${value}`);
  }
  return lines;
}

async function api(path, token) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "grenmet-rulesets-check",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GET ${path} -> ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** Live rulesets with their rules (the list endpoint omits them). */
export async function fetchRulesets(repo, token) {
  const list = await api(`/repos/${repo}/rulesets`, token);
  return Promise.all(
    list.map((ruleset) => api(`/repos/${repo}/rulesets/${ruleset.id}`, token))
  );
}

export function readSnapshot(root = repoRoot) {
  return JSON.parse(readFileSync(join(root, SNAPSHOT_PATH), "utf8"));
}

function writeSnapshot(root, rulesets) {
  const path = join(root, SNAPSHOT_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(rulesets, null, 2)}\n`);
  return path;
}

async function main(argv) {
  const mode = argv.includes("--snapshot") ? "snapshot" : "check";
  const repoFlag = argv.indexOf("--repo");
  const repo =
    repoFlag === -1
      ? (process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO)
      : argv[repoFlag + 1];
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const live = normalize(await fetchRulesets(repo, token));

  if (mode === "snapshot") {
    const path = writeSnapshot(repoRoot, live);
    console.log(
      `Wrote ${live.length} ruleset(s) for ${repo} to ${path}. Run \`pnpm fix:changed\` before committing: the check compares parsed JSON, the format gate compares bytes.`
    );
    return;
  }
  const { comparable, unchecked } = withoutHiddenBypassActors(
    readSnapshot(),
    live
  );
  if (unchecked.length > 0) {
    console.log(
      `bypass_actors not visible to this token, not compared for: ${unchecked.join(", ")}. Run --check with an admin token to compare them.`
    );
  }
  const changes = diff(comparable, live);
  if (changes.length === 0) {
    console.log(
      `Live rulesets for ${repo} match ${SNAPSHOT_PATH} (${live.length} ruleset(s)).`
    );
    return;
  }
  console.error(
    `Live rulesets for ${repo} differ from ${SNAPSHOT_PATH}. Either the settings changed (review them, then run \`node scripts/guardrails/github-rulesets.mjs --snapshot\`) or the snapshot was edited by hand.`
  );
  for (const line of changes) console.error(`  ${line}`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
