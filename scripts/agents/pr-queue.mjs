#!/usr/bin/env node
// What is each open PR waiting on, and who has to act? One command so nobody
// re-checks PRs by hand: owner, Claude Code and Codex read the same table.
//
// Usage: node scripts/agents/pr-queue.mjs [--json] [--repo owner/name]
// Reads only from GitHub through `gh`; it never changes anything.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO = "Marcus100/grenmet";
const REVIEW_LABEL = "factory-review";
const OWNER_MERGE = /OWNER-MERGE/;
const FACTORY_CODE = "Factory review";
const FACTORY_SECURITY = "Factory security review";
const FACTORY = new Set([FACTORY_CODE, FACTORY_SECURITY]);
// A failing check seen on this many open PRs is a repo-wide blocker, not
// something each PR's author should chase separately.
const SHARED_FAILURE_MIN_PRS = 3;
const SHARED_SHOWN = 4;
const FIELDS =
  "number,title,isDraft,mergeStateStatus,labels,statusCheckRollup,headRefName";

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

function collect(pr) {
  const failing = [];
  const pending = [];
  const factory = {};
  for (const check of pr.statusCheckRollup ?? []) {
    const name = checkName(check);
    const result = checkResult(check);
    if (FACTORY.has(name)) {
      factory[name] = result;
      continue;
    }
    if (result === "fail") failing.push(name);
    if (result === "pending") pending.push(name);
  }
  return { failing: [...new Set(failing)], pending, factory };
}

/** Names of failing checks that fail on several open PRs at once. */
export function sharedFailures(prs) {
  const counts = new Map();
  for (const pr of prs)
    for (const name of collect(pr).failing)
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

function reviewRow(pr, factory, ownerMerge) {
  const code = factory[FACTORY_CODE];
  const security = factory[FACTORY_SECURITY];
  if (code === "fail" || security === "fail")
    return row(pr, "review failed", "author", "read the review comment");
  if (code === "pass" && security === "pass")
    return ownerMerge
      ? row(pr, "reviewed, ready", "owner", "owner-only files: you merge")
      : row(pr, "reviewed, ready", "worker", "the worker merges it");
  if (code === "pending" || security === "pending")
    return row(pr, "in review", "nobody", "the review worker is on it");
  return row(pr, "waiting for review", "nobody", "the worker picks it up");
}

/** One PR to one row: its state and who must act next. */
export function classify(pr, shared = new Set()) {
  const { failing, pending, factory } = collect(pr);
  const own = failing.filter((name) => !shared.has(name));
  const blockers = failing.filter((name) => shared.has(name));
  const labels = (pr.labels ?? []).map((label) => label.name);
  const ownerMerge = OWNER_MERGE.test(pr.title);
  if (pr.isDraft) return row(pr, "draft", "author");
  if (own.length) return row(pr, "CI failing", "author", own.join(", "));
  if (pr.mergeStateStatus === "BEHIND")
    return row(pr, "behind dev", "author", "sync, one PR at a time");
  if (pending.length)
    return row(pr, "CI running", "nobody", `${pending.length} checks`);
  if (!labels.includes(REVIEW_LABEL))
    return row(pr, "needs review label", "author", `add ${REVIEW_LABEL}`);
  const result = reviewRow(pr, factory, ownerMerge);
  if (blockers.length)
    result.detail = `${result.detail}; repo-wide blocker: ${blockers.join(", ")}`;
  return result;
}

export function buildQueue(prs) {
  const shared = sharedFailures(prs);
  const rows = prs.map((pr) => classify(pr, shared));
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
      `Repo-wide blockers (fail on ${SHARED_FAILURE_MIN_PRS}+ PRs): ${shown}${more > 0 ? ` and ${more} more` : ""}`
    );
  }
  lines.push(`Needs you: ${you.length ? you.join(", ") : "nothing"}`);
  return lines.join("\n");
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

export function run(argv, fetch = fetchPulls, log = console.log) {
  const repoFlag = argv.indexOf("--repo");
  const repo = repoFlag === -1 ? DEFAULT_REPO : argv[repoFlag + 1];
  const queue = buildQueue(fetch(repo));
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
