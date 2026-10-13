#!/usr/bin/env node
// Runs only the gates the current diff needs, so agents stop re-deriving them.
// Usage: pnpm verify:changed [--base <ref>] [--dry-run] [--skip <check>]...

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const API = "apps/api/fastapi/";
const UV = ["uv", "run", "--frozen", "--package", "fast-back"];
// Files Biome formats; everything else is ignored by `ultracite check`.
const BIOME = /\.(?:[cm]?[jt]sx?|json|jsonc|css|graphql)$/;
const CONTRACT =
  /^apps\/api\/fastapi\/(?:openapi\.json|src\/main\.py|src\/(?:.+\/)?(?:router|routes|schemas?)\.py|src\/(?:.+\/)?(?:routers|schemas?)\/.*\.py)$/;

const WEB = /^(?:apps\/web|packages)\//;
const API_DOMAIN = /^src\/([^/]+)\//;
const API_SHARED = /^src\/[^/]+\.py$/;
const API_TEST = /^tests\/.+\.py$/;
const AGENT_CONFIG =
  /^(?:\.claude|\.codex|\.agents|scripts\/guardrails|\.github)\//;
const VERIFICATION = /^scripts\/(?:verification|integrations|perf)\//;
const DELIVERY = /^scripts\/(?:ci|production)\//;

const check = (name, command, args, cwd) => ({ name, command, args, cwd });
const pnpm = (name, ...args) => check(name, "pnpm", args);

// Path rules for repo-level gates: [matches a changed file, checks to run].
const RULES = [
  [
    (f) => WEB.test(f) || f === "pnpm-lock.yaml",
    ["type-check", "test"].map((task) =>
      pnpm(task, "turbo", "run", task, "--affected")
    ),
  ],
  [(f) => CONTRACT.test(f), [pnpm("api client drift", "check:drift")]],
  [
    (f) =>
      f === "AGENTS.md" || f.endsWith("/AGENTS.md") || AGENT_CONFIG.test(f),
    [pnpm("guardrails", "test:guardrails")],
  ],
  [
    (f) => VERIFICATION.test(f),
    [pnpm("verification scripts", "test:verification")],
  ],
  [(f) => DELIVERY.test(f), [pnpm("delivery scripts", "test:delivery")]],
  [
    (f) => f.endsWith(".md") || f.startsWith("scripts/docs/"),
    [pnpm("doc links", "docs:check-links"), pnpm("doc tests", "test:docs")],
  ],
  [
    (f) => f.startsWith("docs/portfolio/"),
    [pnpm("portfolio coverage", "docs:check-portfolio")],
  ],
];

// API test targets for a changed domain: tests/<domain>/ and tests/test_<domain>_*.py.
export function apiTestTargets(domain, testFiles) {
  const targets = [];
  if (testFiles.includes(`${domain}/`)) targets.push(`tests/${domain}`);
  for (const file of testFiles) {
    if (file.startsWith(`test_${domain}_`) || file === `test_${domain}.py`)
      targets.push(`tests/${file}`);
  }
  return targets;
}

// Pytest targets for changed API files; an empty list means the full suite,
// because shared modules and conftest affect every domain.
function apiPytestTargets(apiFiles, testFiles) {
  const targets = new Set();
  for (const file of apiFiles) {
    const rest = file.slice(API.length);
    const domain = API_DOMAIN.exec(rest)?.[1];
    if (domain)
      for (const target of apiTestTargets(domain, testFiles))
        targets.add(target);
    else if (API_SHARED.test(rest) || rest === "tests/conftest.py") return [];
    else if (API_TEST.test(rest)) targets.add(rest);
  }
  return targets.size > 0 ? [...targets].sort() : undefined;
}

function apiChecks(files, testFiles) {
  const apiFiles = files.filter((f) => f.startsWith(API) && f.endsWith(".py"));
  if (apiFiles.length === 0) return [];
  const checks = [check("api lint+types", "bash", ["scripts/lint.sh"], API)];
  const targets = apiPytestTargets(apiFiles, testFiles);
  if (targets)
    checks.push(
      check(
        "api tests",
        UV[0],
        [...UV.slice(1), "pytest", "-q", ...targets],
        API
      )
    );
  return checks;
}

// Pure planner: maps changed paths to checks. `testFiles` lists entries under
// apps/api/fastapi/tests (directories end with "/").
export function planChecks(files, { base, testFiles = [] } = {}) {
  const checks = [];
  const biomeFiles = files.filter((file) => BIOME.test(file));
  if (biomeFiles.length > 0)
    checks.push(
      pnpm("format+lint", "exec", "ultracite", "check", ...biomeFiles)
    );
  checks.push(...apiChecks(files, testFiles));
  for (const [matches, ruleChecks] of RULES)
    if (files.some(matches)) checks.push(...ruleChecks);
  if (base)
    checks.push(
      check("blast radius", "node", [
        "scripts/guardrails/check-blast-radius.mjs",
        "--base",
        base,
        "--head",
        "HEAD",
      ])
    );
  return checks;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function parseArgs(argv) {
  const options = { base: "origin/dev", dryRun: false, skip: new Set() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") options.base = argv[++i];
    else if (argv[i] === "--dry-run") options.dryRun = true;
    else if (argv[i] === "--skip") options.skip.add(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const mergeBase = git(["merge-base", options.base, "HEAD"]);
  const lines = (text) => text.split("\n").filter(Boolean);
  // Committed, staged, unstaged and untracked changes since the merge base.
  const files = [
    ...new Set([
      ...lines(git(["diff", "--name-only", "--diff-filter=ACMR", mergeBase])),
      ...lines(git(["ls-files", "--others", "--exclude-standard"])),
    ]),
  ].filter((file) => existsSync(join(root, file)));
  if (files.length === 0) {
    console.log(`verify:changed: nothing changed since ${options.base}.`);
    return;
  }
  const testsDir = join(root, API, "tests");
  const testFiles = existsSync(testsDir)
    ? readdirSync(testsDir, { withFileTypes: true }).map((entry) =>
        entry.isDirectory() ? `${entry.name}/` : entry.name
      )
    : [];
  const committed = git(["rev-parse", "HEAD"]) !== mergeBase;
  const checks = planChecks(files, {
    base: committed ? mergeBase : undefined,
    testFiles,
  }).filter((check) => !options.skip.has(check.name));

  console.log(
    `verify:changed: ${files.length} file(s) since ${options.base}; ${checks.length} check(s).`
  );
  const results = [];
  for (const check of checks) {
    const line = [check.command, ...check.args].join(" ");
    console.log(
      `\n▶ ${check.name}: ${check.cwd ? `(${check.cwd}) ` : ""}${line}`
    );
    if (options.dryRun) continue;
    const result = spawnSync(check.command, check.args, {
      cwd: join(root, check.cwd ?? ""),
      stdio: "inherit",
      env: { ...process.env, TURBO_SCM_BASE: options.base },
    });
    results.push({ name: check.name, ok: result.status === 0 });
  }
  if (options.dryRun) return;
  console.log("\nverify:changed summary");
  for (const { name, ok } of results)
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
