#!/usr/bin/env node
// Runs only the gates the current diff needs, so agents stop re-deriving them.
// Usage: pnpm verify:changed [--base <ref>] [--dry-run] [--full] [--skip <check>]...
//   --full runs the whole API suite including the fuzz tests CI runs separately.
//   PYTEST_WORKERS=<n> overrides the automatic API test worker count.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, fingerprint, writeReceipt } from "./receipt.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const API = "apps/api/fastapi/";
// Mirrors ci-api.yml: sync the API with the GMS collector once, then run every
// tool with --no-sync so none of them re-syncs the collector away (mypy needs it).
const API_SYNC = "uv sync --frozen --package fast-back --package gms-ingest";
const UV_RUN = "uv run --no-sync --package fast-back";
// Files Biome formats; everything else is ignored by `ultracite check`.
const BIOME = /\.(?:[cm]?[jt]sx?|json|jsonc|css|graphql)$/;
const CONTRACT =
  /^apps\/api\/fastapi\/(?:openapi\.json|src\/main\.py|src\/(?:.+\/)?(?:router|routes|schemas?)\.py|src\/(?:.+\/)?(?:routers|schemas?)\/.*\.py)$/;

// Portfolio coverage fails when a directory under these parents is not listed in
// docs/portfolio/repository-delivery-map.md, so any change there can break it.
// Root documents such as SECURITY.md are governed surfaces too.
const PORTFOLIO_SURFACE =
  /^(?:(?:scripts|packages|infra|docs\/portfolio|\.github|\.claude|\.agents)\/|[A-Z][A-Z_]*\.md$)/;
// Smoke tests exist for these apps; they skip themselves when no dev server is up.
const WEB_UI =
  /^apps\/web\/(?:gms|gaa-admin)\/(?:src|e2e|playwright\.config\.ts)/;
const WEB = /^(?:apps\/web|packages)\//;
const API_DOMAIN = /^src\/([^/]+)\//;
const API_SHARED = /^src\/[^/]+\.py$/;
const API_TEST = /^tests\/.+\.py$/;
// Test infrastructure every domain imports.
const API_TEST_INFRA =
  /^tests\/(?:conftest|factories|database_target|__init__)\.py$/;
const AGENT_CONFIG =
  /^(?:\.claude|\.codex|\.agents|scripts\/(?:guardrails|agents)|\.github)\//;
const VERIFICATION = /^scripts\/(?:verification|integrations|perf)\//;
const DELIVERY = /^scripts\/(?:ci|production)\//;
// The suppression ratchet in the guardrail tests counts lint and type suppressions
// in every first-party source file, so any added or edited source file can fail it.
const SUPPRESSIBLE = /\.(?:py|[cm]?[jt]sx?)$/;

// Local API test workers: CPUs minus two (min 1) so the machine stays usable,
// dropping to two when the 1-minute load average already exceeds the CPU count.
// PYTEST_WORKERS (a positive integer) overrides both rules.
const RESERVED_CPUS = 2;
const BUSY_WORKERS = 2;
export function apiWorkers({
  cpus = availableParallelism(),
  load = loadavg()[0],
  env = process.env,
} = {}) {
  const override = Number.parseInt(env.PYTEST_WORKERS ?? "", 10);
  if (override > 0) return override;
  const base = Math.max(1, cpus - RESERVED_CPUS);
  return load > cpus ? Math.min(base, BUSY_WORKERS) : base;
}

const check = (name, command, args, cwd) => ({ name, command, args, cwd });
const pnpm = (name, ...args) => check(name, "pnpm", args);

// Path rules for repo-level gates: [matches a changed file, checks to run].
const RULES = [
  [
    (f) => WEB.test(f) || f === "pnpm-lock.yaml",
    // Two test tasks at once, as in CI and `pnpm test`: each Vitest config
    // takes half the cores, so a third concurrent task would oversubscribe.
    ["type-check", "test"].map((task) =>
      pnpm(
        task,
        "turbo",
        "run",
        task,
        "--affected",
        ...(task === "test" ? ["--concurrency=2"] : [])
      )
    ),
  ],
  [
    (f) => WEB_UI.test(f),
    [check("e2e smoke", "node", ["scripts/verification/e2e-if-up.mjs"])],
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
    (f) => PORTFOLIO_SURFACE.test(f),
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

// Dependency manifests: a bump can break any domain, so these run lint+types and
// the full suite. The uv workspace lock lives at the repo root.
const API_DEPENDENCIES = new Set([
  "uv.lock",
  "pyproject.toml",
  `${API}pyproject.toml`,
  `${API}uv.lock`,
]);
// main.py wires every router, middleware and handler. A change there is checked
// by a core subset (startup, OpenAPI, settings, release contract) plus the
// domains it touches, not the whole suite. CI still runs everything.
const API_ENTRYPOINT = "src/main.py";
const API_CORE_TESTS = [
  "tests/test_startup_imports.py",
  "tests/test_openapi_contract.py",
  "tests/test_release_contract_inputs.py",
  "tests/test_settings.py",
  "tests/test_schema_datetime_guard.py",
  "tests/utils",
];
// tests/<dir>/... runs that directory; tests/test_x.py runs itself.
const API_TEST_DIR = /^tests\/([^/]+)\/.+$/;

// Pytest targets for one changed API file: "full" for the whole suite, else a list.
function apiFileTargets(file, testFiles) {
  if (API_DEPENDENCIES.has(file)) return "full";
  const rest = file.slice(API.length);
  const domain = API_DOMAIN.exec(rest)?.[1];
  if (domain) return apiTestTargets(domain, testFiles);
  if (rest === API_ENTRYPOINT) return API_CORE_TESTS;
  if (API_SHARED.test(rest) || API_TEST_INFRA.test(rest)) return "full";
  const testDir = API_TEST_DIR.exec(rest)?.[1];
  if (testDir) return [`tests/${testDir}`];
  return API_TEST.test(rest) ? [rest] : [];
}

// Pytest targets for changed API files; an empty list means the full suite,
// because shared modules, conftest and dependencies affect every domain.
function apiPytestTargets(apiFiles, testFiles) {
  const targets = new Set();
  for (const file of apiFiles) {
    const fileTargets = apiFileTargets(file, testFiles);
    if (fileTargets === "full") return [];
    for (const target of fileTargets) targets.add(target);
  }
  return targets.size > 0 ? [...targets].sort() : undefined;
}

// Runs from apps/api/fastapi; the wrapper supplies the local-development API
// settings so a fresh worktree without .env.local still works.
const API_ENV = "../../../scripts/agents/api-env.sh";

// Overrides the pyproject default (-m 'not fuzz') so the fuzz suite runs too.
const WITH_FUZZ = ["-m", "'fuzz or not fuzz'"];
const FUZZ_TEST = "tests/test_api_fuzz.py";

function apiChecks(files, testFiles, { workers = 1, full = false } = {}) {
  const apiFiles = files.filter(
    (f) =>
      API_DEPENDENCIES.has(f) ||
      (f.startsWith(API) && (f.endsWith(".py") || f.startsWith(`${API}tests/`)))
  );
  if (apiFiles.length === 0 && !full) return [];
  const lint = [
    API_SYNC,
    `${UV_RUN} ruff check src scripts tests`,
    `${UV_RUN} ruff format src scripts tests --check`,
    `${UV_RUN} mypy src`,
  ].join(" && ");
  const checks = [check("api lint+types", API_ENV, ["bash", "-c", lint], API)];
  // --full runs everything, including the fuzz suite that local runs skip.
  const targets = full ? [] : apiPytestTargets(apiFiles, testFiles);
  if (targets) {
    const parallel =
      workers > 1 ? ["-n", String(workers), "--dist", "load"] : [];
    const fuzz = full || targets.includes(FUZZ_TEST) ? WITH_FUZZ : [];
    const pytest = [UV_RUN, "pytest", "-q", ...parallel, ...fuzz, ...targets];
    checks.push(
      check(
        "api tests",
        API_ENV,
        ["bash", "-c", `${API_SYNC} && ${pytest.join(" ")}`],
        API
      )
    );
  }
  return checks;
}

// Pure planner: maps changed paths to checks. `testFiles` lists entries under
// apps/api/fastapi/tests (directories end with "/").
// `deleted` paths still trigger type-check, tests and drift, but are never
// passed to the formatter because they no longer exist.
export function planChecks(
  files,
  { base, testFiles = [], deleted = [], workers = 1, full = false } = {}
) {
  const checks = [];
  const gone = new Set(deleted);
  const biomeFiles = files.filter(
    (file) => BIOME.test(file) && !gone.has(file)
  );
  if (biomeFiles.length > 0)
    checks.push(
      pnpm("format+lint", "exec", "ultracite", "check", ...biomeFiles)
    );
  checks.push(...apiChecks(files, testFiles, { workers, full }));
  for (const [matches, ruleChecks] of RULES)
    if (files.some(matches)) checks.push(...ruleChecks);
  // CI runs the guardrail tests on every change; a deleted file cannot add a suppression.
  if (
    files.some((file) => SUPPRESSIBLE.test(file) && !gone.has(file)) &&
    !checks.some((c) => c.name === "guardrails")
  )
    checks.push(pnpm("guardrails", "test:guardrails"));
  if (base)
    checks.push(
      check("risk tier", "node", [
        "scripts/guardrails/risk-tier.mjs",
        "--base",
        base,
      ]),
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
  const options = {
    base: "origin/dev",
    dryRun: false,
    full: false,
    skip: new Set(),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") options.base = argv[++i];
    else if (argv[i] === "--dry-run") options.dryRun = true;
    else if (argv[i] === "--full") options.full = true;
    else if (argv[i] === "--skip") options.skip.add(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}

/** "1m 05s" or "42s": how long one check took, printed in the summary. */
export function formatSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(rest).padStart(2, "0")}s`
    : `${rest}s`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const mergeBase = git(["merge-base", options.base, "HEAD"]);
  const lines = (text) => text.split("\n").filter(Boolean);
  // Committed, staged, unstaged and untracked changes since the merge base.
  const files = [
    ...new Set([
      ...lines(git(["diff", "--name-only", "--diff-filter=ACMRD", mergeBase])),
      ...lines(git(["ls-files", "--others", "--exclude-standard"])),
    ]),
  ];
  const deleted = files.filter((file) => !existsSync(join(root, file)));
  if (files.length === 0 && !options.full) {
    console.log(`verify:changed: nothing changed since ${options.base}.`);
    return;
  }
  const testsDir = join(root, API, "tests");
  const testFiles = existsSync(testsDir)
    ? readdirSync(testsDir, { withFileTypes: true }).map((entry) =>
        entry.isDirectory() ? `${entry.name}/` : entry.name
      )
    : [];
  const workers = apiWorkers();
  const committed = git(["rev-parse", "HEAD"]) !== mergeBase;
  const checks = planChecks(files, {
    base: committed ? mergeBase : undefined,
    deleted,
    full: options.full,
    testFiles,
    workers,
  }).filter((check) => !options.skip.has(check.name));

  console.log(
    `verify:changed: ${files.length} file(s) since ${options.base}; ${checks.length} check(s); API test workers: ${workers}.`
  );
  const results = [];
  for (const check of checks) {
    const line = [check.command, ...check.args].join(" ");
    console.log(
      `\n▶ ${check.name}: ${check.cwd ? `(${check.cwd}) ` : ""}${line}`
    );
    if (options.dryRun) continue;
    const started = Date.now();
    const result = spawnSync(check.command, check.args, {
      cwd: join(root, check.cwd ?? ""),
      stdio: "inherit",
      env: { ...process.env, TURBO_SCM_BASE: options.base },
    });
    results.push({
      name: check.name,
      ok: result.status === 0,
      seconds: Math.round((Date.now() - started) / 1000),
    });
  }
  if (options.dryRun) return;
  console.log("\nverify:changed summary");
  for (const { name, ok, seconds } of results)
    console.log(`${ok ? "PASS" : "FAIL"} ${name} (${formatSeconds(seconds)})`);
  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
    return;
  }
  if (options.skip.size > 0) {
    console.log(
      "No verification receipt: checks were skipped, so the Stop gate still asks."
    );
    return;
  }
  // Fingerprint after the checks run, so the receipt matches what passed.
  const verifiedFiles = changedFiles(root, options.base) ?? files;
  writeReceipt(root, {
    base: options.base,
    checks: results.map((r) => r.name),
    verified: fingerprint(root, verifiedFiles),
    verifiedAt: new Date().toISOString(),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
