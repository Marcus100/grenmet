// Prints the review handoff block that docs/agents/roles.md ("Working with
// Codex on GitHub") requires, read from git and the verification receipt so
// the head SHA, base SHA, changed files and check results are never typed by
// hand. The owner relays the output to the reviewing tool. Mistakes it makes
// visible: a branch that was never pushed (the reviewer cannot see it), a base
// that advanced since the branch was cut, and verified bytes that are not the
// committed ones.
//
// Push state and base freshness come from `git ls-remote`, not the cached
// origin/* tracking refs, which can say "pushed" for a branch the remote has
// since deleted or moved. When the remote cannot be reached both are reported
// as unverified rather than guessed.
//
//   pnpm agents:handoff            # against origin/dev
//   pnpm agents:handoff -- --base origin/staging

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  changedFiles,
  DEFAULT_BASE,
  fingerprint,
  readReceipt,
} from "../verification/receipt.mjs";

const REMOTE = "origin";
const REMOTE_PREFIX = /^origin\//u;

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Remote heads for the given branch names, read-only, or null when the
 * remote cannot be reached. Exported for the tests to replace.
 */
export function lsRemote(root, branches) {
  const output = git(root, ["ls-remote", "--heads", REMOTE, ...branches]);
  if (output === null) return null;
  const heads = {};
  for (const line of output.split("\n").filter(Boolean)) {
    const [sha, ref] = line.split("\t");
    heads[ref.replace("refs/heads/", "")] = sha;
  }
  return heads;
}

/** Everything the handoff states, as data. */
export function collect(root, base = DEFAULT_BASE, remote = lsRemote) {
  const head = git(root, ["rev-parse", "HEAD"]);
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const baseBranch = base.replace(REMOTE_PREFIX, "");
  const heads = remote(root, [branch, baseBranch]);
  const remoteVerified = heads !== null;
  const remoteHead = heads?.[branch] ?? null;
  // The local base ref is what the branch was actually cut from and diffed
  // against; the remote tip says whether that is still current.
  const localBaseTip = git(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  const baseTip = remoteVerified ? (heads[baseBranch] ?? null) : localBaseTip;
  const mergeBase = localBaseTip
    ? git(root, ["merge-base", base, "HEAD"])
    : null;
  const committed = mergeBase
    ? (git(root, ["diff", "--name-only", "--no-renames", mergeBase, head]) ??
      "")
    : "";
  const dirty = git(root, ["status", "--porcelain"]) ?? "";
  const dirtyCount = dirty ? dirty.split("\n").length : 0;
  // The receipt fingerprints working-tree bytes. Only a clean tree makes
  // those the committed bytes the handoff names.
  const receipt = readReceipt(root);
  const current = dirtyCount === 0 ? changedFiles(root, base) : null;
  const verified =
    Boolean(receipt.verified) &&
    current !== null &&
    receipt.verified === fingerprint(root, current);
  return {
    base,
    baseTip,
    branch,
    dirtyCount,
    files: committed ? committed.split("\n") : [],
    head,
    mergeBase,
    pushed: remoteVerified ? remoteHead === head : null,
    receipt: verified
      ? { checks: receipt.checks ?? [], verifiedAt: receipt.verifiedAt }
      : null,
    remoteVerified,
  };
}

function baseLineFor(info) {
  if (info.reviewBase) {
    return `Review base SHA: ${info.reviewBase} (current on the remote; receipt scope uses merge-base ${info.mergeBase})`;
  }
  if (info.mergeBase === null) {
    return `Base: ${info.base} is not available locally; fetch it first.`;
  }
  if (!info.remoteVerified) {
    return `Base SHA: ${info.mergeBase} (merge-base with the local ${info.base}; the remote could not be reached, so whether ${info.base} has advanced is UNVERIFIED)`;
  }
  if (info.baseTip === null) {
    return `Base SHA: ${info.mergeBase} (merge-base with the local ${info.base}; the remote has no such branch)`;
  }
  if (info.mergeBase === info.baseTip) {
    return `Base SHA: ${info.mergeBase} (${info.base}, current on the remote)`;
  }
  return `Base SHA: ${info.mergeBase} (merge-base with ${info.base}; the remote ${info.base} has since advanced to ${info.baseTip}. Merge it and re-verify before opening the PR.)`;
}

function pushedLineFor(info) {
  if (info.pushed === null) {
    return "Pushed: UNVERIFIED. The remote could not be reached; check before sending.";
  }
  if (info.pushed) {
    return `Pushed: yes (the remote ${info.branch} is at the head SHA)`;
  }
  return "Pushed: NO. Push the branch first; the reviewer cannot see local commits.";
}

function checksLineFor(info) {
  if (info.receipt) {
    return `Checks: pnpm verify:changed PASS at ${info.receipt.verifiedAt} (${info.receipt.checks.join(", ") || "no gates selected"})`;
  }
  if (info.dirtyCount > 0) {
    return "Checks: NOT VERIFIED for the committed head: the working tree has uncommitted changes, so a receipt cannot be attributed to it. Commit or discard them, run pnpm verify:changed and regenerate this handoff.";
  }
  return "Checks: NOT VERIFIED for the current changes. Run pnpm verify:changed and regenerate this handoff.";
}

/** The Markdown block to relay. Lines marked <fill in> are the author's. */
export function render(info) {
  const treeLine =
    info.dirtyCount === 0
      ? "Working tree: clean"
      : `Working tree: ${info.dirtyCount} uncommitted change(s). This handoff covers the committed head only.`;
  const files =
    info.files.length === 0
      ? "- (none: the branch has no commits beyond the base)"
      : info.files.map((file) => `- ${file}`).join("\n");
  return [
    "Read-only review. Write nothing, including SESSION_LOG.md.",
    "",
    "Task: <fill in>",
    "Acceptance criteria: <fill in>",
    "",
    `Branch: ${info.branch}`,
    `Head SHA: ${info.head}`,
    baseLineFor(info),
    pushedLineFor(info),
    treeLine,
    `Changed files (${info.files.length}):`,
    files,
    checksLineFor(info),
    "Known limitations: <fill in>",
    "",
    "Report actionable findings ranked by severity with file:line, or state there are none.",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const baseFlag = args.indexOf("--base");
  const base = baseFlag === -1 ? DEFAULT_BASE : args[baseFlag + 1];
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (!root) {
    console.error("Not inside a git repository.");
    process.exit(1);
  }
  process.stdout.write(render(collect(root, base)));
}
