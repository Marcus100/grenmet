#!/usr/bin/env node
// Explicitly formats all dirty/untracked files in this checkout.
// This does not determine session ownership; never invoke it from a Stop hook.
// Files are kept only when they resolve inside the invoking worktree and not
// inside another registered worktree (nested agent worktrees, symlinks that
// point into a sibling checkout, or untracked nested-repo directories).

import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} failed (${result.status})`);
  }
  return result.stdout;
}

function lines(text) {
  return text.split("\n").filter(Boolean);
}

/** NUL-separated `-z` output; paths are returned verbatim, never quoted. */
export function splitNul(text) {
  return text.split("\0").filter(Boolean);
}

/** Worktree paths from `git worktree list --porcelain` output. */
export function parseWorktreeList(porcelain) {
  return lines(porcelain)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  if (relative === "") {
    return true;
  }
  return !(
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

/**
 * Keeps repo-relative files that are regular files resolving inside `root`
 * and outside every other worktree. `resolve` returns the real path of an
 * absolute path, or null when it is missing or not the requested type.
 * A symlink is kept only when its target is a file inside this worktree.
 */
export function selectOwnedFiles({ root, files, worktrees, resolve }) {
  const realRoot = resolve(root, { directory: true }) ?? root;
  const others = worktrees
    .map((worktree) => resolve(worktree, { directory: true }) ?? worktree)
    .filter((worktree) => worktree !== realRoot);
  const kept = [];
  const skipped = [];
  for (const file of files) {
    const real = resolve(path.join(root, file), { directory: false });
    const owned =
      real !== null &&
      isInside(realRoot, real) &&
      !others.some(
        (other) => isInside(other, real) && !isInside(other, realRoot)
      );
    (owned ? kept : skipped).push(file);
  }
  return { kept, skipped };
}

export function resolveOnDisk(absolute, { directory }) {
  try {
    const real = realpathSync(absolute);
    const stats = statSync(real);
    if (directory ? !stats.isDirectory() : !stats.isFile()) {
      return null;
    }
    return real;
  } catch {
    return null;
  }
}

/** Changed and untracked files, repo-relative, read from `root`. */
export function changedFiles(root) {
  const modified = splitNul(
    run(
      "git",
      ["diff", "--name-only", "-z", "--diff-filter=ACMR", "HEAD"],
      root
    )
  );
  const untracked = splitNul(
    run("git", ["ls-files", "-z", "--others", "--exclude-standard"], root)
  );
  return [...new Set([...modified, ...untracked])];
}

/** `./`-prefixed so a file named like an option is never read as one. */
export function ultraciteArgs(files) {
  return ["exec", "ultracite", "fix", ...files.map((file) => `./${file}`)];
}

function main() {
  const root = run("git", ["rev-parse", "--show-toplevel"]).trim();
  const worktrees = parseWorktreeList(
    run("git", ["worktree", "list", "--porcelain"], root)
  );
  const { kept, skipped } = selectOwnedFiles({
    root,
    files: changedFiles(root),
    worktrees,
    resolve: resolveOnDisk,
  });

  for (const file of skipped) {
    console.log(
      `fix-changed: skipping ${file} (not a file inside this worktree)`
    );
  }
  if (kept.length === 0) {
    console.log("fix-changed: no changed files, nothing to do.");
    process.exit(0);
  }

  console.log(`fix-changed: formatting ${kept.length} changed file(s)...`);
  const result = spawnSync("pnpm", ultraciteArgs(kept), {
    cwd: root,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

/** True when `argv1` (possibly a symlink) is this module's file. */
export function isEntryPoint(argv1, moduleUrl = import.meta.url) {
  if (!argv1) {
    return false;
  }
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isEntryPoint(process.argv[1])) {
  main();
}
