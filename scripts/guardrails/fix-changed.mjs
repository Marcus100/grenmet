#!/usr/bin/env node
// Runs `ultracite fix` scoped to the current session's changed files, not the
// whole repo. `pnpm fix` (repo-wide) reformats every file with a fixable
// issue, including unrelated in-progress work — confirmed to bust turbo's
// type-check cache for an untouched package and surface an unrelated
// pre-existing error as if it were new. Use this for the Always-tier
// "run pnpm fix before done" step; use `pnpm fix` only when you actually
// want repo-wide formatting (e.g. after a dependency bump).

import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  return result.stdout;
}

function changedFiles() {
  const modified = run("git", [
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    "HEAD",
  ])
    .split("\n")
    .filter(Boolean);
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean);
  return [...new Set([...modified, ...untracked])];
}

const files = changedFiles();

if (files.length === 0) {
  console.log("fix-changed: no changed files, nothing to do.");
  process.exit(0);
}

console.log(`fix-changed: formatting ${files.length} changed file(s)...`);
const result = spawnSync("pnpm", ["exec", "ultracite", "fix", ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 0);
