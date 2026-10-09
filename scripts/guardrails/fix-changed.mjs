#!/usr/bin/env node
// Explicitly formats all dirty/untracked files in this checkout.
// This does not determine session ownership; never invoke it from a Stop hook.

import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} failed (${result.status})`);
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
process.exit(result.status ?? 1);
