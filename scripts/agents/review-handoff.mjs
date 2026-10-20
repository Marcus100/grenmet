// Prints the review handoff block that docs/agents/roles.md ("Working with
// Codex on GitHub") requires, read from git and the verification receipt so
// the head SHA, base SHA, changed files and check results are never typed by
// hand. The owner relays the output to the reviewing tool. Two mistakes it
// makes visible: a branch that was never pushed (the reviewer cannot see it)
// and a base that advanced since the branch was cut.
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

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Everything the handoff states, as data. */
export function collect(root, base = DEFAULT_BASE) {
  const head = git(root, ["rev-parse", "HEAD"]);
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const baseTip = git(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  const mergeBase = baseTip ? git(root, ["merge-base", base, "HEAD"]) : null;
  const remoteHead = git(root, [
    "rev-parse",
    "--verify",
    `origin/${branch}^{commit}`,
  ]);
  const committed = mergeBase
    ? (git(root, ["diff", "--name-only", "--no-renames", mergeBase, head]) ??
      "")
    : "";
  const dirty = git(root, ["status", "--porcelain"]) ?? "";
  const receipt = readReceipt(root);
  const current = changedFiles(root, base);
  const verified =
    Boolean(receipt.verified) &&
    current !== null &&
    receipt.verified === fingerprint(root, current);
  return {
    base,
    baseTip,
    branch,
    dirtyCount: dirty ? dirty.split("\n").length : 0,
    files: committed ? committed.split("\n") : [],
    head,
    mergeBase,
    pushed: remoteHead !== null && remoteHead === head,
    receipt: verified
      ? { checks: receipt.checks ?? [], verifiedAt: receipt.verifiedAt }
      : null,
  };
}

function baseLineFor(info) {
  if (info.mergeBase === null) {
    return `Base: ${info.base} is not available locally; fetch it first.`;
  }
  if (info.mergeBase === info.baseTip) {
    return `Base SHA: ${info.mergeBase} (${info.base}, current)`;
  }
  return `Base SHA: ${info.mergeBase} (merge-base with ${info.base}; ${info.base} has since advanced to ${info.baseTip}. Merge it and re-verify before opening the PR.)`;
}

/** The Markdown block to relay. Lines marked <fill in> are the author's. */
export function render(info) {
  const baseLine = baseLineFor(info);
  const pushedLine = info.pushed
    ? `Pushed: yes (origin/${info.branch} is at the head SHA)`
    : "Pushed: NO. Push the branch first; the reviewer cannot see local commits.";
  const treeLine =
    info.dirtyCount === 0
      ? "Working tree: clean"
      : `Working tree: ${info.dirtyCount} uncommitted change(s). This handoff covers the committed head only.`;
  const checksLine = info.receipt
    ? `Checks: pnpm verify:changed PASS at ${info.receipt.verifiedAt} (${info.receipt.checks.join(", ") || "no gates selected"})`
    : "Checks: NOT VERIFIED for the current changes. Run pnpm verify:changed and regenerate this handoff.";
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
    baseLine,
    pushedLine,
    treeLine,
    `Changed files (${info.files.length}):`,
    files,
    checksLine,
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
