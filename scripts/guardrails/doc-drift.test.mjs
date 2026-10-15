// Load-bearing facts in agent instructions must stay true. Agents follow these
// files closely, so a stale name sends them after a skill, script or file that
// no longer exists. Caught so far: a removed skill still named as a fallback,
// and an app AGENTS.md saying it had no e2e tests after they were added.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) =>
  readFileSync(join(repoRoot, relativePath), "utf8");

const SKILL_MENTION = /`\/([a-z][a-z0-9-]+)`/g;
const SKILL_CONTEXT = /\b(skill|skills|command|playbook|run|invoke)\b/i;
// Built-in Claude Code commands, `/tmp`, and an upstream fallback that the root
// AGENTS.md makes unnecessary (it already supplies the tracker and labels).
const KNOWN_EXTERNAL = new Set([
  "compact",
  "context",
  "schedule",
  "tmp",
  "setup-matt-pocock-skills",
]);
const PNPM_SCRIPT = /`pnpm ([a-z][\w:-]*)/g;
const ROOT_PATH =
  /`((?:apps|packages|docs|scripts|\.claude|\.codex|\.github)\/[^`\s<>*{}]+)`/g;
const URL_FRAGMENT = /#.*$/;
const TRAILING_PUNCTUATION = /[.,;:]$/;
const NO_E2E_CLAIM = /no e2e|e2e exists only/i;
const PNPM_BUILTINS = new Set([
  "add",
  "dlx",
  "exec",
  "install",
  "run",
  "test",
  "turbo",
  "vitest",
]);

function trackedFiles(...patterns) {
  const result = spawnSync("git", ["ls-files", ...patterns], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.stdout.trim().split("\n").filter(Boolean);
}

/** The root map and the agent docs that every agent is pointed at. */
const agentDocs = () => [
  "AGENTS.md",
  ...trackedFiles("docs/agents/*.md", ".claude/commands/*.md"),
];

/** Skills and commands an agent can actually invoke by `/name`. */
function invocableNames() {
  const skills = readdirSync(join(repoRoot, ".claude/skills"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const commands = readdirSync(join(repoRoot, ".claude/commands"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3));
  return new Set([...skills, ...commands]);
}

test("every /skill named in agent docs and skills exists", () => {
  const names = invocableNames();
  const files = [...agentDocs(), ...trackedFiles(".claude/skills/*/SKILL.md")];
  const missing = [];
  for (const file of files) {
    for (const line of read(file).split("\n")) {
      // Only lines that talk about skills or commands; routes such as `/hr`
      // and paths such as `/tmp` are not invocations.
      if (!SKILL_CONTEXT.test(line)) continue;
      for (const match of line.matchAll(SKILL_MENTION)) {
        const name = match[1];
        if (names.has(name) || KNOWN_EXTERNAL.has(name)) continue;
        missing.push(`${file}: /${name}`);
      }
    }
  }
  assert.deepEqual(missing, [], "agent docs name skills that do not exist");
});

test("every `pnpm <script>` in agent docs is a root package script", () => {
  const scripts = new Set(
    Object.keys(JSON.parse(read("package.json")).scripts ?? {})
  );
  const missing = [];
  for (const file of agentDocs()) {
    for (const match of read(file).matchAll(PNPM_SCRIPT)) {
      const name = match[1];
      if (scripts.has(name) || PNPM_BUILTINS.has(name)) continue;
      if (name.startsWith("dev:web:") && scripts.has("dev:web:gms")) continue;
      missing.push(`${file}: pnpm ${name}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "agent docs name pnpm scripts that do not exist"
  );
});

test("repo-root paths in agent docs exist", () => {
  const missing = [];
  for (const file of agentDocs()) {
    for (const match of read(file).matchAll(ROOT_PATH)) {
      const path = match[1]
        .replace(URL_FRAGMENT, "")
        .replace(TRAILING_PUNCTUATION, "");
      if (!existsSync(join(repoRoot, path))) missing.push(`${file}: ${path}`);
    }
  }
  assert.deepEqual(missing, [], "agent docs point at paths that do not exist");
});

test("app AGENTS.md files agree with their Playwright setup", () => {
  const problems = [];
  for (const app of readdirSync(join(repoRoot, "apps/web"))) {
    const agents = `apps/web/${app}/AGENTS.md`;
    if (!existsSync(join(repoRoot, agents))) continue;
    const text = read(agents);
    const hasE2e = existsSync(join(repoRoot, `apps/web/${app}/e2e`));
    if (hasE2e && NO_E2E_CLAIM.test(text))
      problems.push(`${agents} says there are no e2e tests, but e2e/ exists`);
    if (hasE2e && !text.includes("e2e"))
      problems.push(`${agents} does not mention its e2e/ smoke tests`);
  }
  assert.deepEqual(problems, []);
});
