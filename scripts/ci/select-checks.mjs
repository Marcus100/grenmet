// Which expensive pull-request checks a diff can affect (docs/operations/
// release-runbook.md, "Pull-request check selection").
//
// Only a pull request into `dev` is narrowed. Every other event (pushes,
// promotion pull requests into staging or main, merge groups, schedules,
// manual runs) keeps every check, so what reaches staging and main was fully
// checked on a dev push first. The selection errs towards more checking: a
// path no rule names selects everything, and so does a diff that cannot be
// listed (select-images.mjs and the workflows' `changes` jobs fall back to
// every check on any error).
//
// Selection lives in jobs, never in workflow-level `paths:` filters: a
// workflow that never starts leaves a required check pending forever.

export const GROUPS = ["api", "storage", "webtests", "journeys", "apiContract"];
export const CODEQL_LANGUAGES = ["javascript-typescript", "python"];
export const FULL_LABEL = "ci:full";
// A diff this long is not worth classifying: run everything.
export const MAX_PATHS = 2000;
// Rollout switch, the repository variable CI_PATH_SELECTION:
//   off    every check runs (selection disabled)
//   shadow every check runs; what selection WOULD skip is recorded (default)
//   on     pull requests into dev run only the selected checks
export const ROLLOUTS = ["off", "shadow", "on"];
export const normalizeRollout = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  return ROLLOUTS.includes(text) ? text : "shadow";
};

const none = () => ({
  api: false,
  storage: false,
  webtests: false,
  journeys: false,
  apiContract: false,
  javascript: false,
  python: false,
});
const everything = () => ({
  api: true,
  storage: true,
  webtests: true,
  journeys: true,
  apiContract: true,
});

// Anything that changes how every check runs or what it installs.
const everythingPath =
  /^(\.github\/|scripts\/ci\/|infra\/github\/|infra\/docker\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|turbo\.json$|biome\.jsonc?$|tsconfig[^/]*\.json$|\.nvmrc$|\.node-version$|\.npmrc$|\.husky\/)/u;
const everythingAnywhere =
  /(^|\/)(Dockerfile[^/]*|package\.json|tsconfig[^/]*\.json|pyproject\.toml|uv\.lock)$/u;

// Test suites read these paths from the other side of the repository (checked
// by apps/api/fastapi/tests/*, which resolve repository paths, and the
// guardrail test that scans for new ones). A change to any of them runs the
// API suite even though it looks like web code.
const apiReadsPath =
  /^(packages\/gms\/|apps\/web\/(bookings|hr)\/src\/app\/|apps\/web\/gms\/src\/lib\/metpy-heat-index\.fixture\.json$|apps\/web\/gaa-admin\/src\/components\/wxproducts\/metpy-humidity\.fixture\.json$|apps\/web\/gaa-admin\/drizzle\/|apps\/web\/cms\/src\/lib\/social-distribution\.ts$)/u;
// Web tests read API sources and the committed contract (parity tests under
// apps/web/**/*.parity.test.ts and the generated client).
const webReadsPath = /^(apps\/api\/fastapi\/src\/|apps\/api\/fastapi\/openapi\.json$|openapi\.json$)/u;

const docsOnlyPrefix =
  /^(docs\/|\.claude\/|\.agents\/|\.codex\/|\.devcontainer\/|\.vscode\/)/u;
const docsOnlyFile = /^(\.gitignore|LICENSE[^/]*|CODEOWNERS)$/u;
const markdown = /\.(md|mdx)$/u;
// Nested Markdown stays code where a suite reads it: the API tree (kept
// conservative) and the Commit blog posts (the app's tests read them).
const markdownIsCode = /^(apps\/api\/fastapi\/|apps\/web\/commit\/content\/)/u;
// docs/ports.md is read by tests/test_reserved_names.py.
const testedDoc = /^docs\/ports\.md$/u;

const javascriptFile = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/u;
const pythonFile = /\.py$/u;
const codeqlIgnored =
  /^(surface\/|wis2box\/|packages\/api-client\/src\/gen\/)|(^|\/)(node_modules|\.next)\//u;

/** Flags one path selects, or `null` when no rule names it (select all). */
function classify(path) {
  const flags = none();
  const scan = () => {
    if (!codeqlIgnored.test(path)) {
      if (javascriptFile.test(path)) flags.javascript = true;
      if (pythonFile.test(path)) flags.python = true;
    }
  };
  if (everythingPath.test(path) || everythingAnywhere.test(path)) return null;
  // SURFACE has its own job (selectSurface); no shared suite reads it.
  if (path.startsWith("surface/")) return flags;
  if (testedDoc.test(path) || path.startsWith("docs/api/")) {
    flags.api = true;
    flags.storage = true;
    return flags;
  }
  if (
    (docsOnlyPrefix.test(path) ||
      docsOnlyFile.test(path) ||
      markdown.test(path)) &&
    !markdownIsCode.test(path)
  )
    return flags;
  if (path.startsWith("apps/web/commit/content/")) {
    flags.webtests = true;
    return flags;
  }
  scan();
  if (apiReadsPath.test(path)) {
    flags.api = true;
    flags.storage = true;
  }
  if (path.startsWith("apps/api/") || path.startsWith("packages/api-client/")) {
    flags.api = true;
    flags.storage = true;
    flags.apiContract = true;
    // The journeys run the API from source; web tests read its sources and
    // contract, and the generated client feeds every app.
    if (
      webReadsPath.test(path) ||
      path.startsWith("packages/api-client/")
    ) {
      flags.webtests = true;
      flags.journeys = true;
    }
    if (path.startsWith("apps/api/fastapi/src/")) flags.journeys = true;
    return flags;
  }
  if (path === "openapi.json" || path.endsWith("/openapi.json")) {
    flags.api = true;
    flags.storage = true;
    flags.apiContract = true;
    flags.webtests = true;
    flags.journeys = true;
    return flags;
  }
  if (
    path.startsWith("apps/web/") ||
    path.startsWith("apps/pwa/") ||
    path.startsWith("packages/")
  ) {
    flags.webtests = true;
    flags.journeys = true;
    // The core storage job builds the CMS migration configuration, which
    // reads the shared packages.
    if (path.startsWith("apps/web/cms/") || path.startsWith("packages/"))
      flags.storage = true;
    return flags;
  }
  return null;
}

const fullSelection = (reason) => ({
  ...everything(),
  codeql: [...CODEQL_LANGUAGES],
  full: true,
  reason,
});

/** The path map's decision, before the rollout switch is applied. */
function narrow(paths, { mode, baseRef, labels }) {
  if (mode !== "affected" || baseRef !== "dev")
    return fullSelection("not a pull request into dev");
  if (labels.includes(FULL_LABEL)) return fullSelection(`${FULL_LABEL} label`);
  if (!Array.isArray(paths)) return fullSelection("changed files unavailable");
  if (paths.length > MAX_PATHS)
    return fullSelection("diff too large to classify");
  const result = none();
  for (const path of paths) {
    const flags = classify(path);
    if (flags === null) return fullSelection(`${path} selects every check`);
    for (const key of Object.keys(result)) result[key] ||= flags[key];
  }
  const { javascript, python, ...groups } = result;
  return {
    ...groups,
    codeql: CODEQL_LANGUAGES.filter((language) =>
      language === "python" ? python : javascript
    ),
    full: false,
    reason: paths.length ? "path map" : "no changed files",
  };
}

/**
 * Checks a diff needs.
 *
 * `paths` are the changed files; `mode` is the image-selection mode (only
 * "affected" narrows), `baseRef` the pull request's target branch, `labels`
 * its label names and `rollout` the CI_PATH_SELECTION switch (default
 * shadow). Returns booleans per group plus `codeql`, the CodeQL languages to
 * analyse, and `reason`. Under `off` and `shadow` the returned groups are all
 * true; in shadow, `would` carries what `on` would have selected for a pull
 * request into dev.
 */
export function selectChecks(
  paths,
  { mode = "affected", baseRef, labels = [], rollout } = {}
) {
  const level = normalizeRollout(rollout);
  const decision = narrow(paths, { mode, baseRef, labels });
  if (level === "on" || (mode !== "affected" || baseRef !== "dev"))
    return { ...decision, rollout: level };
  const effective = fullSelection(
    level === "off"
      ? "CI_PATH_SELECTION=off"
      : "shadow mode: every check runs, selection is only recorded"
  );
  return level === "shadow"
    ? { ...effective, rollout: level, would: decision }
    : { ...effective, rollout: level };
}

/** What a shadow run reports: one small record per pull request head. */
export function selectionRecord(selection, event) {
  const pr = event?.pull_request;
  if (!(selection.would && pr)) return null;
  const would = selection.would;
  return {
    pr: pr.number,
    headSha: pr.head?.sha,
    baseRef: pr.base?.ref,
    rollout: selection.rollout,
    reason: would.reason,
    would: {
      ...Object.fromEntries(GROUPS.map((group) => [group, would[group]])),
      codeql: would.codeql,
    },
    wouldSkip: [
      ...GROUPS.filter((group) => !would[group]),
      ...CODEQL_LANGUAGES.filter((l) => !would.codeql.includes(l)).map(
        (l) => `codeql:${l}`
      ),
    ],
  };
}

export function recordSummary(record) {
  return [
    "### Check selection (shadow)",
    "",
    "Every check ran. With `CI_PATH_SELECTION=on` this pull request would have skipped:",
    "",
    record.wouldSkip.length
      ? record.wouldSkip.map((name) => `- ${name}`).join("\n")
      : "- nothing",
    "",
    `Reason: ${record.reason}`,
    "",
  ].join("\n");
}

/**
 * select-images.mjs integration: on a pull request into dev, and only with
 * rollout `on`, replace the coarse API, web and storage suite selection with
 * the path map. Otherwise the jobs run exactly as selected before.
 */
export function narrowJobs(jobs, paths, event, mode, rollout) {
  const base = event?.pull_request?.base?.ref;
  if (mode !== "affected" || base !== "dev") return jobs;
  const checks = selectChecks(paths, {
    mode,
    baseRef: base,
    labels: (event.pull_request.labels ?? []).map((label) => label.name),
    rollout,
  });
  if (checks.rollout !== "on") return jobs;
  return {
    ...jobs,
    python: checks.api,
    webtests: checks.webtests,
    storage: checks.storage,
  };
}

// Standalone entry for workflows without a selection job of their own
// (e2e.yml, codeql.yml, api-breaking-changes.yml). Never fails: any error
// selects every check.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { changedPaths } from "./changed-paths.mjs";

export function selectFromEvent(event, eventName, git, rollout) {
  const pr = event?.pull_request;
  const base = {
    mode: pr && eventName === "pull_request" ? "affected" : "full",
    baseRef: pr?.base?.ref,
    labels: (pr?.labels ?? []).map((label) => label.name),
    rollout,
  };
  let paths;
  try {
    paths = base.mode === "affected" ? changedPaths(event, git) : [];
  } catch {
    paths = undefined;
  }
  return selectChecks(paths, base);
}

/** Writes the shadow record (JSON file and job summary) when there is one. */
export function writeShadowRecord(
  selection,
  event,
  { file = "ci-selection.json", summary = process.env.GITHUB_STEP_SUMMARY } = {}
) {
  const record = selectionRecord(selection, event);
  if (!record) return null;
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  if (summary) appendFileSync(summary, `${recordSummary(record)}\n`);
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output } = process.env;
  const git = (args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  let selection;
  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    selection = selectFromEvent(
      event,
      process.env.GITHUB_EVENT_NAME,
      git,
      process.env.CI_PATH_SELECTION
    );
    writeShadowRecord(selection, event);
  } catch {
    selection = selectChecks(undefined, { mode: "full" });
  }
  console.log(`Check selection (${selection.rollout}): ${selection.reason}`);
  const lines = [
    ...GROUPS.map((group) => `${group}=${selection[group]}`),
    `codeql=${JSON.stringify(selection.codeql)}`,
  ];
  if (output) appendFileSync(output, `${lines.join("\n")}\n`);
  else console.log(lines.join("\n"));
}
