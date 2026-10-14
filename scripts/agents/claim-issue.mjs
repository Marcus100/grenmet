#!/usr/bin/env node
// Atomic issue claiming for unattended agents. Checking for a label and then
// adding it is a race; creating a git ref is not. Each claim pushes a fresh
// parentless commit to refs/heads/agent-lock/<issue>. A second claimant's commit
// is unrelated, so the remote rejects it as a non-fast-forward: exactly one wins.
// A lock older than --stale-hours (default 12) is replaced with a compare-and-swap
// (force-with-lease against the exact old SHA), so a crashed run cannot block an
// issue forever.
//
// Usage: node scripts/agents/claim-issue.mjs claim|release <issue> [--remote origin]
//          [--as <name>] [--stale-hours 12] [--no-label]
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
const WHITESPACE = /\s+/;

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
  if (!listing) return { released: false };
  return {
    released: git(["push", remote, "--delete", ref], { cwd }).status === 0,
  };
}

function parseArgs(argv) {
  const [command, issueText, ...rest] = argv;
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
    else throw new Error(`Unknown argument: ${rest[i]}`);
  }
  if (!["claim", "release"].includes(command))
    throw new Error("Usage: claim-issue.mjs claim|release <issue> [options]");
  assertIssue(options.issue);
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const common = { issue: options.issue, remote: options.remote };
  if (options.command === "release") {
    const { released } = releaseLock(common);
    if (options.label) setLabel(options.issue, false);
    console.log(released ? `released #${options.issue}` : "no lock to release");
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
