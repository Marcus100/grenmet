#!/usr/bin/env node
// Decides which workspace packages the pre-push hook runs tests for.
//
// Reads the ref lines git feeds a pre-push hook on stdin
// ("<local ref> <local sha> <remote ref> <remote sha>"), finds the files in the
// commits being pushed, and prints one line for the hook:
//   NONE                          no package changed; skip tests
//   ALL                           a workspace-wide input changed; run every test
//   --filter=./a --filter=./b     only these packages (no dependants)
// Lint and type-check are not scoped here; the hook runs them everywhere. CI
// still runs the full suite.
//
// Usage: node scripts/verification/pre-push-scope.mjs [--base <ref>] < refs

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ZERO_SHA = /^0+$/u;
const WHITESPACE = /\s+/u;
const SHA = /^[a-f0-9]{40}$/iu;
const AGENT_LOCK_REF = /^refs\/heads\/agent-lock\/[1-9]\d*$/u;

// Only coordination refs are exempt: a mixed push still sends application code.
export function onlyAgentLockRefs(input) {
  const lines = input.trim().split("\n");
  return lines.every((line) => {
    const fields = line.trim().split(WHITESPACE);
    return (
      fields.length === 4 &&
      SHA.test(fields[1]) &&
      AGENT_LOCK_REF.test(fields[2]) &&
      SHA.test(fields[3])
    );
  });
}
// Inputs every package depends on: a change can break any test.
const WORKSPACE_WIDE = new Set([
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "package.json",
]);

// Files changed by one pushed ref. A new remote branch (zero remote sha) is
// compared with the base branch; a deletion pushes no code.
export function rangeFor(line, base) {
  const [, localSha, , remoteSha] = line.trim().split(WHITESPACE);
  if (!localSha || ZERO_SHA.test(localSha)) return;
  return ZERO_SHA.test(remoteSha ?? "")
    ? { from: base, to: localSha }
    : { from: remoteSha, to: localSha };
}

// Maps changed files to workspace package directories (nearest package.json).
// `hasPackage(dir)` says whether a directory is a workspace package.
export function scopeFor(files, hasPackage) {
  const packages = new Set();
  for (const file of files) {
    if (WORKSPACE_WIDE.has(file)) return { all: true, packages: [] };
    let dir = dirname(file);
    while (dir !== ".") {
      if (hasPackage(dir)) {
        packages.add(dir);
        break;
      }
      dir = dirname(dir);
    }
  }
  return { all: false, packages: [...packages].sort() };
}

export function render({ all, packages }) {
  if (all) return "ALL";
  if (packages.length === 0) return "NONE";
  return packages.map((dir) => `--filter=./${dir}`).join(" ");
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function filesIn(range) {
  // Three dots: only what the pushed commits add on top of the base.
  const spec = `${range.from}...${range.to}`;
  return git(["diff", "--name-only", spec]).split("\n").filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const stdin = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
  if (args.includes("--only-agent-locks")) {
    process.exitCode = onlyAgentLockRefs(stdin) ? 0 : 1;
    return;
  }
  const base = args.includes("--base")
    ? args[args.indexOf("--base") + 1]
    : "origin/dev";
  const lines = stdin.split("\n").filter(Boolean);
  // Run by hand (no refs on stdin): treat HEAD as the pushed ref.
  const refs =
    lines.length > 0
      ? lines
      : [
          `HEAD ${git(["rev-parse", "HEAD"]).trim()} refs/heads/dev ${"0".repeat(40)}`,
        ];
  const files = new Set();
  for (const line of refs) {
    const range = rangeFor(line, base);
    if (!range) continue;
    try {
      for (const file of filesIn(range)) files.add(file);
    } catch {
      // Unknown base (for example no origin/dev): be safe and run everything.
      console.log("ALL");
      return;
    }
  }
  const hasPackage = (dir) => existsSync(join(root, dir, "package.json"));
  console.log(render(scopeFor([...files], hasPackage)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (process.argv.includes("--only-agent-locks")) process.exitCode = 1;
    else console.log("ALL");
  }
}
