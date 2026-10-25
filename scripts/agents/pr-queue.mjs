#!/usr/bin/env node
// What is each open PR waiting on, and who has to act? One command so nobody
// re-checks PRs by hand: owner, Claude Code and Codex read the same table.
//
// Usage: node scripts/agents/pr-queue.mjs [--json] [--repo owner/name]
// Reads only from GitHub through `gh`; it never changes anything.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ownerMergeRequired } from "./review-worker.mjs";

const DEFAULT_REPO = "Marcus100/grenmet";
const RULESETS_PATH = fileURLToPath(
  new URL("../../infra/github/rulesets.json", import.meta.url)
);
const REVIEW_LABEL = "factory-review";
const DEV = "dev";
const OWNER_MERGE = /OWNER-MERGE/;
const FACTORY_CODE = "Factory review";
const FACTORY_SECURITY = "Factory security review";
const FACTORY = new Set([FACTORY_CODE, FACTORY_SECURITY]);
// Only statuses created by the dedicated review App count: a status with the same
// name from any other user or integration is not trusted (AGENTS.md).
export const TRUSTED_STATUS_LOGIN = "grenmet-factory-review-status[bot]";
// A failing check seen on this many open PRs is a repo-wide blocker, not
// something each PR's author should chase separately.
const SHARED_FAILURE_MIN_PRS = 3;
const SHARED_SHOWN = 4;
const FIELDS =
  "number,title,isDraft,mergeStateStatus,labels,statusCheckRollup,headRefName,baseRefName,headRefOid,files,changedFiles";

function checkName(check) {
  return check.name ?? check.context;
}

/** "pass" | "fail" | "pending" | "skip" for a check run or commit status. */
export function checkResult(check) {
  if (check.__typename === "StatusContext") {
    if (check.state === "SUCCESS") return "pass";
    if (check.state === "PENDING" || check.state === "EXPECTED")
      return "pending";
    return "fail";
  }
  if (check.status !== "COMPLETED") return "pending";
  if (check.conclusion === "SUCCESS") return "pass";
  if (check.conclusion === "SKIPPED" || check.conclusion === "NEUTRAL")
    return "skip";
  return "fail";
}

/**
 * `required` is the set of check names the ruleset demands (null = unknown, so
 * every check counts). A failing check outside it does not stop a merge, so it is
 * reported as advisory instead of blocking.
 */
function collect(pr, required = null) {
  const failing = [];
  const advisory = [];
  const pending = [];
  const factory = {};
  const seen = new Set();
  for (const check of pr.statusCheckRollup ?? []) {
    const name = checkName(check);
    const result = checkResult(check);
    seen.add(name);
    if (FACTORY.has(name)) {
      // A pass only counts when the creator is verified to be the review App;
      // `factoryIssuers` maps each status name to its creator's login.
      factory[name] =
        pr.factoryIssuers?.[name] === TRUSTED_STATUS_LOGIN
          ? result
          : "untrusted";
      continue;
    }
    const counts = required === null || required.has(name);
    if (result === "fail") (counts ? failing : advisory).push(name);
    if (result === "pending" && counts) pending.push(name);
  }
  // A required check that has not reported yet is not green: treat it as pending.
  const missing = [...(required ?? [])].filter(
    (name) => !(FACTORY.has(name) || seen.has(name))
  );
  return {
    failing: [...new Set(failing)],
    advisory: [...new Set(advisory)],
    pending: [...pending, ...missing],
    factory,
  };
}

/** Names of failing checks that fail on several open PRs at once. */
export function sharedFailures(prs, required = null) {
  const counts = new Map();
  for (const pr of prs)
    for (const name of collect(pr, required).failing)
      counts.set(name, (counts.get(name) ?? 0) + 1);
  return new Set(
    [...counts]
      .filter(([, n]) => n >= SHARED_FAILURE_MIN_PRS)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  );
}

function row(pr, state, needs, detail = "") {
  return { number: pr.number, title: pr.title, state, needs, detail };
}

function reviewRow(pr, factory, ownerMerge, filesKnown) {
  const code = factory[FACTORY_CODE];
  const security = factory[FACTORY_SECURITY];
  if (code === "untrusted" || security === "untrusted")
    return row(
      pr,
      "review not verified",
      "owner",
      `a Factory status was not created by ${TRUSTED_STATUS_LOGIN}; do not merge on it`
    );
  if (code === "fail" || security === "fail")
    return row(pr, "review failed", "author", "read the review comment");
  if (code === "pass" && security === "pass") {
    if (!(ownerMerge || filesKnown))
      return row(
        pr,
        "ownership unknown",
        "owner",
        "complete changed-file list unavailable"
      );
    return ownerMerge
      ? row(pr, "reviewed, ready", "owner", "owner-only files: you merge")
      : row(
          pr,
          "reviewed, ready",
          "worker",
          "the worker rechecks scope before merging"
        );
  }
  if (code === "pending" || security === "pending")
    return row(pr, "in review", "nobody", "the review worker is on it");
  return row(pr, "waiting for review", "nobody", "the worker picks it up");
}

/** One PR to one row: its state and who must act next. */
export function classify(pr, shared = new Set(), required = null) {
  const { failing, advisory, pending, factory } = collect(pr, required);
  // A failing required check always blocks and belongs to the author. When it also
  // fails on several other PRs the common cause is only a hint, so it is noted but
  // never turns the PR into "waiting for a shared fix".
  const failingNames = failing.map((name) =>
    shared.has(name) ? `${name} (also on ${SHARED_FAILURE_MIN_PRS}+ PRs)` : name
  );
  const labels = (pr.labels ?? []).map((label) => label.name);
  const paths = Array.isArray(pr.files)
    ? pr.files
        .map((file) => file?.path)
        .filter((path) => typeof path === "string" && path.length > 0)
    : [];
  const filesKnown =
    Number.isSafeInteger(pr.changedFiles) &&
    pr.changedFiles >= 0 &&
    paths.length === pr.changedFiles &&
    paths.length === pr.files?.length &&
    new Set(paths).size === paths.length;
  const ownerMerge = OWNER_MERGE.test(pr.title) || ownerMergeRequired(paths);
  if (pr.isDraft) return row(pr, "draft", "author");
  if (pr.mergeStateStatus === "DIRTY")
    return row(pr, "merge conflict", "author", "resolve the conflicts");
  if (failing.length)
    return row(pr, "CI failing", "author", failingNames.join(", "));
  if (pr.mergeStateStatus === "BEHIND")
    return row(pr, "behind dev", "author", "sync, one PR at a time");
  if (pending.length)
    return row(pr, "CI running", "nobody", `${pending.length} checks`);
  // Promotions (dev to staging, staging to main) are never merged by the worker.
  if (pr.baseRefName && pr.baseRefName !== DEV)
    return row(
      pr,
      "promotion ready",
      "owner",
      `you merge into ${pr.baseRefName}`
    );
  if (!labels.includes(REVIEW_LABEL))
    return row(pr, "needs review label", "author", `add ${REVIEW_LABEL}`);
  const result = reviewRow(pr, factory, ownerMerge, filesKnown);
  if (advisory.length)
    result.detail = `${result.detail}; non-required failing: ${advisory.join(", ")}`;
  return result;
}

export function buildQueue(prs, required = null) {
  const shared = sharedFailures(prs, required);
  const rows = prs.map((pr) => classify(pr, shared, required));
  const order = { owner: 0, author: 1, worker: 2, nobody: 3 };
  rows.sort((a, b) => order[a.needs] - order[b.needs] || a.number - b.number);
  return { rows, shared: [...shared] };
}

export function render({ rows, shared }) {
  const lines = ["PR     NEEDS    STATE               DETAIL"];
  for (const r of rows)
    lines.push(
      `#${r.number}`.padEnd(7) +
        r.needs.padEnd(9) +
        r.state.padEnd(20) +
        [r.detail, r.title.slice(0, 50)].filter(Boolean).join("  |  ")
    );
  const you = rows
    .filter((r) => r.needs === "owner")
    .map((r) => `#${r.number}`);
  lines.push("");
  if (shared.length) {
    const shown = shared.slice(0, SHARED_SHOWN).join(", ");
    const more = shared.length - SHARED_SHOWN;
    lines.push(
      `Failing on several PRs, maybe a shared cause (fail on ${SHARED_FAILURE_MIN_PRS}+ PRs): ${shown}${more > 0 ? ` and ${more} more` : ""}`
    );
  }
  lines.push(`Needs you: ${you.length ? you.join(", ") : "nothing"}`);
  return lines.join("\n");
}

/** Check names the `Protect dev` ruleset requires, or null if the file is unreadable. */
export function requiredContexts(path = RULESETS_PATH) {
  try {
    const rulesets = JSON.parse(readFileSync(path, "utf8"));
    // Same fallback as the review worker: until the snapshot lists `Protect dev`,
    // `Protect staging` carries the same required checks.
    const ruleset =
      rulesets.find((rule) => rule.name === "Protect dev") ??
      rulesets.find((rule) => rule.name === "Protect staging");
    const checks = ruleset?.rules.find(
      (rule) => rule.type === "required_status_checks"
    )?.parameters.required_status_checks;
    return checks ? new Set(checks.map((check) => check.context)) : null;
  } catch {
    return null;
  }
}

/** The creator login of the newest status per context on a commit. */
export function statusIssuers(statuses) {
  const issuers = {};
  for (const item of statuses) {
    // GitHub lists the newest status first for each context.
    if (!(item.context in issuers))
      issuers[item.context] = item.creator?.login ?? "";
  }
  return issuers;
}

function fetchStatuses(repo, sha) {
  const result = spawnSync(
    "gh",
    ["api", `repos/${repo}/commits/${sha}/statuses`, "--paginate", "--slurp"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout).flat();
  } catch {
    return null;
  }
}

function fetchPulls(repo) {
  const result = spawnSync(
    "gh",
    ["pr", "list", "--repo", repo, "--state", "open", "--limit", "100"].concat([
      "--json",
      FIELDS,
    ]),
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.status !== 0)
    throw new Error(`gh pr list failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

export function run(
  argv,
  fetch = fetchPulls,
  log = console.log,
  required = requiredContexts(),
  statuses = fetchStatuses
) {
  const repoFlag = argv.indexOf("--repo");
  const repo = repoFlag === -1 ? DEFAULT_REPO : argv[repoFlag + 1];
  const prs = fetch(repo);
  for (const pr of prs) {
    const hasFactory = (pr.statusCheckRollup ?? []).some((check) =>
      FACTORY.has(checkName(check))
    );
    if (hasFactory && pr.headRefOid) {
      const snapshot = statuses(repo, pr.headRefOid);
      if (!Array.isArray(snapshot)) {
        // Preserve the rollup only as unverified evidence, never as approval.
        pr.factoryIssuers = {};
        continue;
      }
      pr.factoryIssuers = statusIssuers(snapshot);
      const latest = new Map();
      for (const check of snapshot)
        if (FACTORY.has(check.context) && !latest.has(check.context))
          latest.set(check.context, {
            ...check,
            __typename: "StatusContext",
            state: check.state.toUpperCase(),
          });
      // State and issuer must come from the same read. A newer trusted pending
      // status must not validate an older success from the GraphQL rollup.
      pr.statusCheckRollup = [
        ...(pr.statusCheckRollup ?? []).filter(
          (check) => !FACTORY.has(checkName(check))
        ),
        ...latest.values(),
      ];
    }
  }
  const queue = buildQueue(prs, required);
  log(argv.includes("--json") ? JSON.stringify(queue, null, 2) : render(queue));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
