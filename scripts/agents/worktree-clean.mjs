#!/usr/bin/env node
// Preview finished Claude worktrees; remove one explicitly selected safe target.
import { spawnSync } from "node:child_process";
import { readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIGITS = /^\d+$/u;
const BASE = "refs/remotes/origin/dev";
const GENERATED = new Set([
  "node_modules",
  ".venv",
  ".pnpm-store",
  ".turbo",
  ".next",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "coverage",
]);

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`git ${args[0]} could not verify worktree safety`);
  return result.stdout;
}

export function worktrees(root) {
  const entries = [];
  let entry = {};
  for (const field of git(root, [
    "worktree",
    "list",
    "--porcelain",
    "-z",
  ]).split("\0")) {
    if (!field) {
      if (entry.path) entries.push(entry);
      entry = {};
    } else if (field.startsWith("worktree ")) entry.path = field.slice(9);
    else if (field.startsWith("HEAD ")) entry.head = field.slice(5);
    else if (field.startsWith("branch ")) entry.branch = field.slice(7);
    else if (field === "locked" || field.startsWith("locked "))
      entry.locked = true;
    else if (field === "prunable" || field.startsWith("prunable "))
      entry.prunable = true;
  }
  return entries;
}

function inside(root, path) {
  const child = relative(root, path);
  return (
    child !== "" &&
    child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  );
}

export function processDirectories(procRoot = "/proc") {
  if (!process.getuid) throw new Error("Process inspection requires Linux");
  const directories = [];
  for (const name of readdirSync(procRoot)) {
    if (!DIGITS.test(name)) continue;
    try {
      const processPath = join(procRoot, name);
      if (statSync(processPath).uid !== process.getuid()) continue;
      directories.push(readlinkSync(join(processPath, "cwd")));
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH")
        throw new Error(
          `Cannot verify whether process ${name} owns a worktree`
        );
    }
  }
  return directories;
}

export function inspectWorktree(root, entry, directories = processDirectories) {
  const blocked = (reason) => ({ ...entry, eligible: false, reason });
  try {
    const main = realpathSync(root);
    const allowed = join(main, ".claude", "worktrees");
    const path = realpathSync(entry.path);
    // A symlinked management directory or target cannot widen the removal scope.
    if (
      realpathSync(allowed) !== allowed ||
      !inside(allowed, path) ||
      resolve(entry.path) !== path
    )
      return blocked(
        "Outside the canonical .claude/worktrees directory or reached through a symlink"
      );
    if (entry.locked)
      return blocked(
        "Worktree is locked; its owner must confirm it is finished"
      );
    if (entry.prunable)
      return blocked("Registration needs repair before cleanup");
    const head = git(path, ["rev-parse", "HEAD"]).trim();
    if (head !== entry.head)
      return blocked("Worktree revision changed during inspection");
    const merged = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", head, BASE],
      { cwd: root, encoding: "utf8", timeout: 60_000 }
    );
    if (merged.status !== 0)
      return blocked(
        "Worktree commit is not verified as merged into origin/dev"
      );
    for (const item of git(path, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--ignored=matching",
    ])
      .split("\0")
      .filter(Boolean)) {
      if (!item.startsWith("!! "))
        return blocked("Tracked changes or untracked files need preservation");
      const ignored = item.slice(3);
      if (!ignored.split("/").some((part) => GENERATED.has(part)))
        return blocked(`Ignored data needs preservation: ${ignored}`);
    }
    for (const cwd of directories())
      if (cwd === path || inside(path, cwd))
        return blocked("A running process is using this worktree");
    return {
      ...entry,
      eligible: true,
      reason: "Merged, clean, unlocked, and no running process found",
    };
  } catch (error) {
    return blocked(error.message);
  }
}

export function removeWorktree(root, target, directories = processDirectories) {
  const path = resolve(target);
  const entry = worktrees(root).find((item) => resolve(item.path) === path);
  if (!entry) throw new Error("Target is not a registered worktree");
  const first = inspectWorktree(root, entry, directories);
  if (!first.eligible) throw new Error(first.reason);
  // Re-read registration and all checks immediately before the normal Git removal.
  const latest = worktrees(root).find((item) => resolve(item.path) === path);
  if (!latest || latest.head !== entry.head || latest.branch !== entry.branch)
    throw new Error("Worktree registration changed; inspect it again");
  const final = inspectWorktree(root, latest, directories);
  if (!final.eligible) throw new Error(final.reason);
  git(root, ["worktree", "remove", "--", path]);
  return { path, removed: true, branchRetained: entry.branch ?? null };
}

export function run(argv, checkout = ROOT, log = console.log) {
  const { values } = parseArgs({
    args: argv,
    options: { remove: { type: "string" } },
  });
  const common = git(checkout, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]).trim();
  const root = dirname(common);
  if (!worktrees(root).some((entry) => resolve(entry.path) === root))
    throw new Error("Cannot establish the canonical main checkout");
  if (values.remove)
    log(JSON.stringify(removeWorktree(root, values.remove), null, 2));
  else {
    const allowed = join(root, ".claude", "worktrees");
    const plan = worktrees(root)
      .filter((entry) => inside(allowed, resolve(entry.path)))
      .map((entry) => inspectWorktree(root, entry));
    log(
      JSON.stringify(
        {
          mode: "preview",
          base: git(root, ["rev-parse", BASE]).trim(),
          worktrees: plan,
        },
        null,
        2
      )
    );
  }
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
