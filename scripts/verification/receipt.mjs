// A verification receipt records that `pnpm verify:changed` passed for the
// exact contents of the changed files, so the Stop hook
// (.claude/hooks/verify-before-stop.mjs) can tell verified work from
// unverified work without re-running any check.
//
// The fingerprint hashes each changed file's path and bytes, so committing
// verified work keeps it verified while any later edit invalidates it. The
// receipt lives in the worktree's own git dir and is never committed.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RECEIPT_FILE = "agent-verify-receipt.json";
export const DEFAULT_BASE = "origin/dev";

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const lines = (text) => (text ? text.split("\n").filter(Boolean) : []);

/** Committed, staged, unstaged and untracked changes since `base`, sorted. */
export function changedFiles(root, base = DEFAULT_BASE) {
  const mergeBase = git(root, ["merge-base", base, "HEAD"]);
  if (!mergeBase) return null;
  // --no-renames lists both sides of a rename, so the old path stays covered.
  const tracked = lines(
    git(root, ["diff", "--name-only", "--no-renames", mergeBase])
  );
  const untracked = lines(
    git(root, ["ls-files", "--others", "--exclude-standard"])
  );
  return [...new Set([...tracked, ...untracked])].sort();
}

/** Hash of every changed path and its current bytes ("deleted" if gone). */
export function fingerprint(root, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const path = join(root, file);
    hash.update(`${file}\0`);
    hash.update(existsSync(path) ? readFileSync(path) : "deleted");
    hash.update("\0");
  }
  return hash.digest("hex");
}

function receiptPath(root) {
  const gitDir = git(root, ["rev-parse", "--git-dir"]);
  return gitDir ? join(resolve(root, gitDir), RECEIPT_FILE) : null;
}

export function readReceipt(root) {
  const path = receiptPath(root);
  if (!(path && existsSync(path))) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function writeReceipt(root, fields) {
  const path = receiptPath(root);
  if (!path) return;
  writeFileSync(
    path,
    `${JSON.stringify({ ...readReceipt(root), ...fields }, null, 2)}\n`
  );
}
