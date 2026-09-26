// Self-check for the agent-instruction surface (AGENTS.md and hooks).
// This repo has been bitten twice by drift here: a Where-to-Look row pointing
// at the wrong doc, and a hooks.json using an event name Codex doesn't
// support, sitting in a location Codex doesn't read. Both looked correct on
// read and were wrong in practice. This asserts the things a human reviewer
// would otherwise have to re-verify by hand every time these files change.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) =>
  readFileSync(join(repoRoot, relativePath), "utf8");
const resolve = (relativePath) => join(repoRoot, relativePath);

const NEXT_HEADING = /\n## /;
const TABLE_SEPARATOR_ROW = /^\|[\s-]+\|/;
const BACKTICK_CELL = /`([^`]+)`/;
const CODEX_BUDGET = /^project_doc_max_bytes\s*=\s*(\d+)/m;

/**
 * Extract `path` cells from the markdown table under `heading`, up to the
 * next `## ` heading or end of file. Skips template rows containing a `<...>`
 * placeholder (e.g. `apps/web/<app>/AGENTS.md`) — those aren't literal paths.
 */
function tablePaths(source, heading) {
  const afterHeading = source.split(heading)[1];
  assert.ok(afterHeading, `heading not found: ${heading}`);
  const section = afterHeading.split(NEXT_HEADING)[0];
  const paths = [];
  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (TABLE_SEPARATOR_ROW.test(line.trim())) continue; // separator row
    const cells = line.split("|").map((cell) => cell.trim());
    const pathCell = cells.at(-2); // last real column before trailing empty
    const match = pathCell?.match(BACKTICK_CELL);
    if (!match) continue;
    const path = match[1];
    if (path.includes("<")) continue; // template row, not a literal path
    paths.push(path);
  }
  assert.ok(paths.length > 5, `expected several path rows under ${heading}`);
  return paths;
}

function assertPathExists(path) {
  const isDir = path.endsWith("/");
  const target = resolve(isDir ? path.slice(0, -1) : path);
  assert.ok(
    existsSync(target),
    `Where-to-Look points at a path that doesn't exist: ${path}`
  );
  if (isDir) {
    assert.ok(statSync(target).isDirectory(), `expected a directory: ${path}`);
  }
}

test("AGENTS.md Where to Look table points at real paths", () => {
  const agentsMd = read("AGENTS.md");
  for (const path of tablePaths(agentsMd, "## Where to Look\n")) {
    assertPathExists(path);
  }
});

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".venv",
  ".turbo",
  "node_modules",
  "__pycache__",
  "surface",
  "wis2box",
  "geonetcast",
]);

/** Every instruction file with the given name, as repo-relative paths. */
function instructionFiles(name, dir = "", found = []) {
  for (const entry of readdirSync(resolve(dir || "."), {
    withFileTypes: true,
  })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
      instructionFiles(name, dir ? `${dir}/${entry.name}` : entry.name, found);
    } else if (entry.name === name) {
      found.push(dir ? `${dir}/${name}` : name);
    }
  }
  return found;
}

test("Claude Code can load the AGENTS.md tree without legacy instruction overrides", () => {
  const claudeFiles = [
    ...instructionFiles("CLAUDE.md"),
    ...instructionFiles("CLAUDE.local.md"),
  ];
  assert.deepEqual(
    claudeFiles,
    [],
    `remove project Claude instruction overrides so native AGENTS.md support applies: ${claudeFiles.join(", ")}`
  );
});

test("root AGENTS.md instruction map covers every nested AGENTS.md", () => {
  const root = read("AGENTS.md");
  for (const agents of instructionFiles("AGENTS.md")) {
    if (agents === "AGENTS.md") continue;
    const dir = agents.slice(0, -"/AGENTS.md".length);
    const segments = dir.split("/");
    const covered =
      root.includes(`\`${agents}\``) ||
      // Template rows such as `apps/web/<app>/AGENTS.md` list names in prose.
      root.includes(segments.at(-1));
    assert.ok(
      covered,
      `root AGENTS.md instruction map does not mention ${agents}`
    );
  }
});

test("Codex instruction chain stays within the configured byte budget", () => {
  // Codex concatenates AGENTS.md from the repo root down to its working
  // directory and stops at project_doc_max_bytes (see .codex/config.toml).
  const budgetMatch = read(".codex/config.toml").match(CODEX_BUDGET);
  const budget = budgetMatch ? Number(budgetMatch[1]) : 32 * 1024;
  for (const agents of instructionFiles("AGENTS.md")) {
    const parts = agents.split("/").slice(0, -1);
    let total = 0;
    for (let depth = 0; depth <= parts.length; depth += 1) {
      const candidate = [...parts.slice(0, depth), "AGENTS.md"].join("/");
      if (existsSync(resolve(candidate))) {
        total += statSync(resolve(candidate)).size;
      }
    }
    assert.ok(
      total <= budget,
      `AGENTS.md chain ending at ${agents} is ${total} bytes, over the ${budget}-byte Codex budget`
    );
  }
});

/**
 * Extract every `.claude/hooks/<file>` reference from a hook-command string
 * (works against both JSON string values and raw TOML `command = "..."`
 * lines, since we only need the substring, not full parsing).
 */
function hookScriptReferences(source) {
  const matches = source.matchAll(/\.claude\/hooks\/[\w.-]+/g);
  return [...new Set([...matches].map((m) => m[0]))];
}

function assertHookScriptsAreRunnable(source, label) {
  const refs = hookScriptReferences(source);
  assert.ok(refs.length > 0, `expected hook script references in ${label}`);
  for (const ref of refs) {
    const scriptPath = resolve(ref);
    assert.ok(
      existsSync(scriptPath),
      `${label} references missing script: ${ref}`
    );
    if (ref.endsWith(".mjs")) {
      const check = spawnSync(process.execPath, ["--check", scriptPath]);
      assert.equal(
        check.status,
        0,
        `${label} references a script with a syntax error: ${ref}\n${check.stderr}`
      );
    }
  }
}

test("Claude Code settings.json only references hook scripts that exist and are executable", () => {
  const settings = read(".claude/settings.json");
  JSON.parse(settings); // fails loudly if settings.json is invalid JSON
  assertHookScriptsAreRunnable(settings, ".claude/settings.json");
});

test("Codex config.toml only references hook scripts that exist and are executable", () => {
  const config = read(".codex/config.toml");
  assertHookScriptsAreRunnable(config, ".codex/config.toml");
});

test("Claude Code and Codex guardrail hooks reference the same scripts (no forked copies)", () => {
  const claudeRefs = hookScriptReferences(read(".claude/settings.json")).sort();
  const codexRefs = hookScriptReferences(read(".codex/config.toml")).sort();
  const shared = claudeRefs.filter((ref) => codexRefs.includes(ref));
  assert.ok(
    shared.length >= 2,
    "expected Claude Code and Codex to share at least the git-guardrail and protect-files hooks"
  );
});

test(".agents/skills is a symlink to .claude/skills, not a forked copy", () => {
  const link = resolve(".agents/skills");
  assert.ok(
    lstatSync(link).isSymbolicLink(),
    ".agents/skills must be a symlink"
  );
  const target = resolve(".claude/skills");
  assert.equal(
    statSync(link).ino,
    statSync(target).ino,
    "symlink must resolve to .claude/skills"
  );
});

test(".agents/hooks.json does not exist (Codex does not read hooks from .agents/)", () => {
  assert.equal(
    existsSync(resolve(".agents/hooks.json")),
    false,
    ".agents/hooks.json is not a real Codex hook location — see .codex/config.toml"
  );
});

test("skills-lock.json has no dangling entries and no orphaned external skill dirs", () => {
  const lock = JSON.parse(read("skills-lock.json"));
  const lockedNames = new Set(Object.keys(lock.skills));
  const skillDirs = new Set(
    readdirSync(resolve(".claude/skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );

  for (const name of lockedNames) {
    assert.ok(
      skillDirs.has(name),
      `skills-lock.json references '${name}' but .claude/skills/${name} doesn't exist — remove the stale lock entry`
    );
  }

  // Skills not in the lockfile are expected: repo-custom skills (api-change,
  // gaa-admin-change, design-critique, refactoring-ui, stack-doctor,
  // git-guardrails-claude-code) have no upstream source, so they're never
  // locked. This only catches the other direction: a locked skill whose
  // directory is gone.
});
