#!/usr/bin/env node
// Classifies a change as low, standard or high risk from its paths, so
// unattended agent PRs can be routed: high always needs a human reviewer.
// Usage: node scripts/guardrails/risk-tier.mjs --staged | --base <ref> [--head <ref>]

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Security, data, delivery and dependency surfaces. Order is irrelevant.
const HIGH = [
  [/^apps\/api\/fastapi\/src\/auth\//u, "API auth"],
  [/(?:^|\/)permissions\.py$/u, "permission catalogue"],
  [/^apps\/api\/fastapi\/alembic\/versions\//u, "main DB migration"],
  [/^apps\/api\/fastapi\/src\/[^/]+\/migrations\//u, "domain DB migration"],
  [/^packages\/auth\//u, "shared auth package"],
  [/^apps\/web\/auth\//u, "auth app"],
  [/^\.github\//u, "CI/CD workflow"],
  [/^infra\//u, "infrastructure"],
  [
    /(?:^|\/)Dockerfile[^/]*$|(?:^|\/)docker-compose[^/]*\.ya?ml$/u,
    "container build",
  ],
  [/^\.claude\/(?:hooks|settings[^/]*\.json)|^\.codex\//u, "agent guardrail"],
  [
    /^(?:apps\/[^/]+\/[^/]+\/)?(?:package\.json|pyproject\.toml)$|^(?:pnpm-lock\.yaml|pnpm-workspace\.yaml|uv\.lock)$/u,
    "dependencies",
  ],
  [
    /^scripts\/guardrails\/(?:suppression|coverage)-baseline\.json$/u,
    "quality baseline",
  ],
  [/^(?:turbo\.json|biome\.jsonc|tsconfig[^/]*\.json)$/u, "repo toolchain"],
];

// Changes that cannot alter runtime behaviour on their own.
const LOW = [
  /\.mdx?$/u,
  /^docs\//u,
  /^\.claude\/(?:skills|commands)\//u,
  /(?:^|\/)(?:tests?|__tests__)\//u,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u,
  /(?:^|\/)test_[^/]+\.py$/u,
];

export function riskTier(files) {
  const reasons = [];
  for (const file of files)
    for (const [pattern, reason] of HIGH)
      if (pattern.test(file)) reasons.push(`${reason}: ${file}`);
  if (reasons.length > 0) return { reasons, tier: "high" };
  if (files.length > 0 && files.every((f) => LOW.some((p) => p.test(f))))
    return { reasons: ["docs, skills and tests only"], tier: "low" };
  return { reasons: [], tier: "standard" };
}

function changedFiles(args) {
  const range =
    args[0] === "--staged"
      ? ["--cached"]
      : [args[1], args[3] ?? "HEAD"].filter(Boolean);
  if (args[0] !== "--staged" && args[0] !== "--base")
    throw new Error(
      "Usage: risk-tier.mjs --staged | --base <ref> [--head <ref>]"
    );
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--find-renames", ...range],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.split("\n").filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { reasons, tier } = riskTier(changedFiles(process.argv.slice(2)));
    console.log(`risk-tier: ${tier}`);
    for (const reason of reasons.slice(0, 20)) console.log(`  ${reason}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
