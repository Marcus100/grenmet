#!/usr/bin/env node
// Atomic issue claiming for unattended agents. Checking for a label and then
// adding it is a race; creating a git ref is not. Each claim pushes a fresh
// parentless commit to refs/heads/agent-lock/<issue>. A second claimant's commit
// is unrelated, so the remote rejects it as a non-fast-forward: exactly one wins.
// A lock older than --stale-hours (default 12) is replaced with a compare-and-swap
// (force-with-lease against the exact old SHA), so a crashed run cannot block an
// issue forever.
//
// Cloud sandboxes can create refs but their remote refuses to delete them, so a
// lock cannot always be released by the run that took it. `sweep` is for a
// maintainer's machine: it deletes the lock of every closed issue.
//
// Usage: node scripts/agents/claim-issue.mjs claim|release <issue> [--remote origin]
//          [--as <name>] [--stale-hours 12] [--no-label]
//        node scripts/agents/claim-issue.mjs sweep [--dry-run] [--remote origin]
// Exit codes: 0 claimed/released, 3 already claimed, 2 usage or git error.

import { spawnSync } from "node:child_process";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const LOCK_PREFIX = "refs/heads/agent-lock/";
const DEFAULT_STALE_HOURS = 12;
const HOUR_MS = 3_600_000;
const EXIT_CLAIMED_BY_OTHER = 3;
const EXIT_ERROR = 2;
const LABEL = "agent-claimed";
const WHITESPACE = /\s+/u;
const DIGITS = /^\d+$/u;

function git(args, { cwd, env, input } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
  });
  return {
    status: result.status ?? 1,
    stderr: (result.stderr ?? "").trim(),
    stdout: (result.stdout ?? "").trim(),
  };
}

function must(result, what) {
  if (result.status !== 0) throw new Error(`${what} failed: ${result.stderr}`);
  return result.stdout;
}

const lockRef = (issue) => `${LOCK_PREFIX}${issue}`;

function assertIssue(issue) {
  if (!Number.isInteger(issue) || issue < 1)
    throw new Error("issue must be a positive integer");
}

// A parentless commit that records who claimed the issue and when.
function createLockCommit({ cwd, issue, claimant, now }) {
  must(
    git(["hash-object", "-t", "tree", "-w", "--stdin"], { cwd, input: "" }),
    "writing the empty tree"
  );
  const when = new Date(now).toISOString();
  const identity = {
    GIT_AUTHOR_DATE: when,
    GIT_AUTHOR_EMAIL: "agent-lock@invalid",
    GIT_AUTHOR_NAME: "agent-lock",
    GIT_COMMITTER_DATE: when,
    GIT_COMMITTER_EMAIL: "agent-lock@invalid",
    GIT_COMMITTER_NAME: "agent-lock",
  };
  return must(
    git(
      [
        "commit-tree",
        EMPTY_TREE,
        "-m",
        `agent lock for #${issue} by ${claimant} at ${when}`,
      ],
      { cwd, env: identity }
    ),
    "creating the lock commit"
  );
}

function inspectLock({ cwd, remote, ref }) {
  const listing = must(git(["ls-remote", remote, ref], { cwd }), "ls-remote");
  const sha = listing.split(WHITESPACE)[0];
  if (!sha) return null;
  must(git(["fetch", "--no-tags", remote, ref], { cwd }), "fetching the lock");
  const [seconds, ...subject] = must(
    git(["log", "-1", "--format=%ct %s", "FETCH_HEAD"], { cwd }),
    "reading the lock"
  ).split(" ");
  return { heldBy: subject.join(" "), sha, time: Number(seconds) * 1000 };
}

export function claimLock({
  cwd,
  remote = "origin",
  issue,
  claimant,
  staleHours = DEFAULT_STALE_HOURS,
  now = Date.now(),
}) {
  assertIssue(issue);
  const ref = lockRef(issue);
  const sha = createLockCommit({ claimant, cwd, issue, now });
  if (git(["push", remote, `${sha}:${ref}`], { cwd }).status === 0)
    return { claimed: true, stolen: false };

  const existing = inspectLock({ cwd, ref, remote });
  if (!existing) throw new Error("push was rejected but no lock exists");
  const ageHours = (now - existing.time) / HOUR_MS;
  if (ageHours < staleHours)
    return { ageHours, claimed: false, heldBy: existing.heldBy };

  // Compare-and-swap: succeeds only if the lock is still the stale one we read.
  const swap = git(
    [
      "push",
      `--force-with-lease=${ref}:${existing.sha}`,
      remote,
      `${sha}:${ref}`,
    ],
    { cwd }
  );
  if (swap.status === 0) return { claimed: true, stolen: true };
  return { ageHours, claimed: false, heldBy: existing.heldBy };
}

export function releaseLock({ cwd, remote = "origin", issue }) {
  assertIssue(issue);
  const ref = lockRef(issue);
  // `push --delete` on a missing ref exits 0 with only a warning, so look first.
  const listing = must(git(["ls-remote", remote, ref], { cwd }), "ls-remote");
  if (!listing) return { released: false, reason: "absent" };
  const deleted = git(["push", remote, "--delete", ref], { cwd });
  if (deleted.status === 0) return { released: true };
  return { released: false, reason: "refused", detail: deleted.stderr };
}

/** Issue numbers that currently hold a lock ref on the remote. */
export function listLocks({ cwd, remote = "origin" }) {
  const out = must(
    git(["ls-remote", remote, `${LOCK_PREFIX}*`], { cwd }),
    "ls-remote"
  );
  return out
    .split("\n")
    .map((line) => line.split(WHITESPACE)[1]?.slice(LOCK_PREFIX.length))
    .filter((name) => name && DIGITS.test(name))
    .map(Number);
}

// Deletes the lock of every issue `isClosed` says is finished. A lock whose
// issue is still open may belong to a live run or an open PR, so it stays.
export function sweepLocks({ cwd, remote = "origin", isClosed, dryRun }) {
  const swept = [];
  const kept = [];
  const failed = [];
  for (const issue of listLocks({ cwd, remote })) {
    if (!isClosed(issue)) {
      kept.push(issue);
      continue;
    }
    if (dryRun) {
      swept.push(issue);
      continue;
    }
    const result = releaseLock({ cwd, issue, remote });
    (result.released ? swept : failed).push(issue);
  }
  return { failed, kept, swept };
}

function parseArgs(argv) {
  const [command, ...tail] = argv;
  const takesIssue = command !== "sweep";
  const [issueText, ...rest] = takesIssue ? tail : [undefined, ...tail];
  const options = {
    claimant: process.env.AGENT_NAME ?? `${hostname()}-${process.pid}`,
    command,
    issue: Number(issueText),
    label: true,
    remote: "origin",
    staleHours: DEFAULT_STALE_HOURS,
  };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--remote") options.remote = rest[++i];
    else if (rest[i] === "--as") options.claimant = rest[++i];
    else if (rest[i] === "--stale-hours")
      options.staleHours = Number(rest[++i]);
    else if (rest[i] === "--no-label") options.label = false;
    else if (rest[i] === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown argument: ${rest[i]}`);
  }
  if (!["claim", "release", "sweep"].includes(command))
    throw new Error(
      "Usage: claim-issue.mjs claim|release <issue> | sweep [options]"
    );
  if (takesIssue) assertIssue(options.issue);
  return options;
}

// The label is a convenience for humans; the lock ref is the source of truth.
function setLabel(issue, add) {
  const flag = add ? "--add-label" : "--remove-label";
  const result = spawnSync(
    "gh",
    ["issue", "edit", String(issue), flag, LABEL],
    {
      encoding: "utf8",
    }
  );
  if (result.status !== 0)
    console.error(`warning: could not update the ${LABEL} label`);
}

function issueIsClosed(issue) {
  const result = spawnSync(
    "gh",
    ["issue", "view", String(issue), "--json", "state", "--jq", ".state"],
    { encoding: "utf8" }
  );
  if (result.status !== 0)
    throw new Error(`could not read issue #${issue} with gh`);
  return result.stdout.trim() === "CLOSED";
}

function describeRelease(issue, result) {
  if (result.released) return `released #${issue}`;
  if (result.reason === "refused")
    return `could not delete the lock for #${issue}: the remote refused. It expires after ${DEFAULT_STALE_HOURS}h, or a maintainer can run: pnpm agents:sweep`;
  return "no lock to release";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const common = { issue: options.issue, remote: options.remote };
  if (options.command === "sweep") {
    const { failed, kept, swept } = sweepLocks({
      dryRun: options.dryRun,
      isClosed: issueIsClosed,
      remote: options.remote,
    });
    const verb = options.dryRun ? "would release" : "released";
    console.log(`${verb}: ${swept.join(", ") || "none"}`);
    console.log(`kept (issue still open): ${kept.join(", ") || "none"}`);
    if (failed.length > 0) {
      console.log(`could not delete: ${failed.join(", ")}`);
      process.exitCode = EXIT_ERROR;
    }
    return;
  }
  if (options.command === "release") {
    const result = releaseLock(common);
    if (options.label) setLabel(options.issue, false);
    console.log(describeRelease(options.issue, result));
    return;
  }
  const result = claimLock({
    ...common,
    claimant: options.claimant,
    staleHours: options.staleHours,
  });
  if (!result.claimed) {
    console.log(
      `#${options.issue} is already claimed (${result.heldBy}, ${result.ageHours.toFixed(1)}h ago)`
    );
    process.exitCode = EXIT_CLAIMED_BY_OTHER;
    return;
  }
  if (options.label) setLabel(options.issue, true);
  console.log(
    `${result.stolen ? "took over a stale lock for" : "claimed"} #${options.issue}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = EXIT_ERROR;
  }
}
