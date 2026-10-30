#!/usr/bin/env node
// Automated skill trigger evals (docs/agents/skill-standard.md → Testing). Every
// prompt in .claude/skills/<name>/evals/triggers.md and every case in
// scripts/agents/skill-trigger-evals.json is sent to a fresh, read-only agent
// session. The agent's structured log says which skills fired, and each case
// passes when the expected skills fired (or stayed silent).
//
//   node scripts/agents/skill-evals.mjs --agent claude|codex [options]
//
// Options:
//   --model <name>      model to run (recorded as "default" when omitted)
//   --skill <name>      only cases for this skill (repeatable)
//   --limit <n>         run at most n cases
//   --json              print the summary and every case as JSON
//   --keep              keep the clone in the cache directory after the run
//   --dry-run           list the selected cases, no model calls
//   --agent-cmd <exe>   fake agent for tests: called with the prompt, stdout = JSONL
//
// Environment: CLAUDE_BIN and CODEX_BIN override the binaries.
// Output: a trigger table per skill, appended per case to
// ~/.cache/grenmet-skill-evals/results.jsonl. Exit 0 when every case passes, 1
// when any fails, 2 on usage or environment errors.
//
// Isolation: each run clones the repo at HEAD (git clone --local) into a temp
// directory under ~/.cache/grenmet-skill-evals/ and deletes it afterwards unless
// --keep. Only committed skill text is evaluated: uncommitted edits are not in
// the clone. The environment is scrubbed
// with benchmark.mjs's scrubbedEnv, so API keys do not turn plan runs into billed
// calls. This is not a container: the agent runs as you in the clone.

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrubbedEnv } from "./benchmark.mjs";
import { claudeBinary } from "./sessions.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JSON_CASES_FILE = join(
  repoRoot,
  "scripts/agents/skill-trigger-evals.json"
);
const CACHE_ROOT = join(homedir(), ".cache", "grenmet-skill-evals");
const RESULTS_FILE = join(CACHE_ROOT, "results.jsonl");
const AGENTS = ["claude", "codex"];
const JSON_GROUP = "(json cases)";
const CASE_TIMEOUT_MS = 10 * 60_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const CLAUDE_MAX_TURNS = "4";
const PERCENT = 100;
const TAIL_CHARS = 800;
const EXIT_ERROR = 2;
const USAGE =
  "Usage: node scripts/agents/skill-evals.mjs --agent claude|codex [--model m] [--skill n]... [--limit n] [--json] [--keep] [--dry-run]";

const SECTIONS = {
  "Should trigger": "trigger",
  "Should not trigger": "no-trigger",
};
const HEADING = /^##\s+(.*?)\s*$/u;
const TOP_HEADING = /^#\s/u;
const BULLET = /^\s*- (.+?)\s*$/u;
// Paths that show an agent read a skill's instructions, e.g. through `cat`.
const SKILL_READ = /\.(?:agents|claude)\/skills\/([\w-]+)\/SKILL\.md/gu;
const CODEX_TEXT_KEYS = new Set(["command", "cmd", "input", "arguments"]);

// Bullets under the two trigger sections become cases for `skillName`.
export function parseTriggers(markdown, skillName) {
  const cases = [];
  let expect;
  for (const line of markdown.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      expect = SECTIONS[heading[1]];
      continue;
    }
    if (TOP_HEADING.test(line)) {
      expect = undefined;
      continue;
    }
    const bullet = BULLET.exec(line);
    if (expect && bullet)
      cases.push({ skill: skillName, prompt: bullet[1], expect });
  }
  return cases;
}

// Every repo skill's triggers.md, then the combined JSON cases.
export function loadCases({
  root = repoRoot,
  jsonFile = JSON_CASES_FILE,
} = {}) {
  const skillsDir = join(root, ".claude", "skills");
  const markdown = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((name) => {
      const file = join(skillsDir, name, "evals", "triggers.md");
      return existsSync(file)
        ? parseTriggers(readFileSync(file, "utf8"), name)
        : [];
    });
  const combined = JSON.parse(readFileSync(jsonFile, "utf8")).map((item) => ({
    expect: "json",
    prompt: item.prompt,
    should_not_use: item.should_not_use ?? [],
    should_use: item.should_use ?? [],
    skill: JSON_GROUP,
  }));
  return [...markdown, ...combined];
}

// Skill names are compared without any plugin namespace ("plugin:skill").
const unprefixed = (name) => name.split(":").pop();

function collectStrings(value, found) {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value))
    for (const item of value) collectStrings(item, found);
  else if (value && typeof value === "object")
    for (const inner of Object.values(value)) collectStrings(inner, found);
  return found;
}

// Walks the JSONL log for command or tool-input text that names a SKILL.md.
function codexText(value, found) {
  if (Array.isArray(value)) {
    for (const item of value) codexText(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value))
      if (CODEX_TEXT_KEYS.has(key)) collectStrings(inner, found);
      else codexText(inner, found);
  }
  return found;
}

function parseLines(log) {
  const events = [];
  for (const line of log.split("\n")) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Plain-text lines carry no structured events.
    }
  }
  return events;
}

// The skill names an agent used in one session, from its structured log.
// Claude: Skill tool calls. Codex: reads of .agents|.claude/skills/<name>/SKILL.md
// inside command or tool input.
const isSkillCall = (block) =>
  block?.type === "tool_use" &&
  block.name === "Skill" &&
  typeof block.input?.skill === "string";

const claudeSkillNames = (event) =>
  event.type === "assistant" && Array.isArray(event.message?.content)
    ? event.message.content
        .filter(isSkillCall)
        .map((block) => unprefixed(block.input.skill))
    : [];

const codexSkillNames = (event) =>
  codexText(event, []).flatMap((text) =>
    [...text.matchAll(SKILL_READ)].map((match) => match[1])
  );

const SKILL_READERS = { claude: claudeSkillNames, codex: codexSkillNames };

export function skillsFired(log, agent) {
  const reader = SKILL_READERS[agent];
  if (!reader) throw new Error(`Unknown agent: ${agent}`);
  return [...new Set(parseLines(log).flatMap(reader))].sort();
}

// Skills the case expects to fire.
export function expectedFires(testCase) {
  if (testCase.expect === "json") return testCase.should_use;
  return testCase.expect === "trigger" ? [testCase.skill] : [];
}

export function scoreCase(testCase, fired) {
  if (testCase.expect === "json")
    return (
      testCase.should_use.every((name) => fired.includes(name)) &&
      !testCase.should_not_use.some((name) => fired.includes(name))
    );
  const didFire = fired.includes(testCase.skill);
  return testCase.expect === "trigger" ? didFire : !didFire;
}

// Per-skill rows: cases, passed, and the trigger rate (expected skills that
// fired over expected skills; null when nothing was expected).
export function summarize(results) {
  const rows = new Map();
  for (const result of results) {
    const row = rows.get(result.skill) ?? {
      cases: 0,
      expected: 0,
      hits: 0,
      passed: 0,
      skill: result.skill,
    };
    row.cases += 1;
    if (result.passed) row.passed += 1;
    for (const name of expectedFires(result)) {
      row.expected += 1;
      if (result.fired.includes(name)) row.hits += 1;
    }
    rows.set(result.skill, row);
  }
  return [...rows.values()].map((row) => ({
    ...row,
    triggerRate: row.expected === 0 ? null : row.hits / row.expected,
  }));
}

const rateText = (row) =>
  row.triggerRate === null
    ? "-"
    : `${Math.round(row.triggerRate * PERCENT)}% (${row.hits}/${row.expected})`;

export function formatTable(rows, { agent, model }) {
  const header = ["skill", "cases", "passed", "trigger rate"];
  const body = rows.map((row) => [
    row.skill,
    String(row.cases),
    String(row.passed),
    rateText(row),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...body.map((cells) => cells[column].length))
  );
  const line = (cells) =>
    cells
      .map((cell, column) => cell.padEnd(widths[column]))
      .join("  ")
      .trimEnd();
  const total = rows.reduce((sum, row) => sum + row.cases, 0);
  const passed = rows.reduce((sum, row) => sum + row.passed, 0);
  return [
    `agent: ${agent}  model: ${model ?? "default"}`,
    line(header),
    line(widths.map((width) => "-".repeat(width))),
    ...body.map(line),
    `${passed}/${total} cases passed`,
  ].join("\n");
}

export function formatCaseList(cases) {
  const lines = cases.map(
    (testCase) =>
      `${testCase.skill.padEnd(18)}  ${testCase.expect.padEnd(10)}  ${testCase.prompt}`
  );
  return [...lines, `${cases.length} cases`].join("\n");
}

// The agent command line. The claude and codex flags follow the spec in issue
// #415: plan mode and no MCP for Claude, a read-only ephemeral session for Codex.
export function agentCommand({ agent, agentCmd, dir, model, prompt }) {
  if (agentCmd) return { args: [prompt], command: agentCmd };
  if (agent === "claude")
    return {
      args: [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-mode",
        "plan",
        "--no-session-persistence",
        "--max-turns",
        CLAUDE_MAX_TURNS,
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--setting-sources",
        "project,local",
        ...(model ? ["--model", model] : []),
      ],
      command: claudeBinary(),
    };
  if (agent === "codex")
    return {
      args: [
        "exec",
        "--json",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "-C",
        dir,
        ...(model ? ["-m", model] : []),
        prompt,
      ],
      command: process.env.CODEX_BIN ?? "codex",
    };
  throw new Error("--agent must be claude or codex");
}

const tail = (text) =>
  text.length > TAIL_CHARS ? `…${text.slice(-TAIL_CHARS)}` : text;

// An error the agent reported in its own log (for example an expired login).
// Such a run says nothing about triggering, so it is an environment failure.
// A turn limit is not one: the log still shows whether the skill fired first.
export function agentError(log) {
  for (const event of parseLines(log)) {
    if (event.type === "result" && event.is_error === true) {
      if (event.subtype === "error_max_turns") continue;
      return String(event.result ?? "agent reported an error");
    }
    if (event.type === "error" || event.type === "turn.failed")
      return String(event.message ?? event.error?.message ?? event.type);
  }
}

// Runs one prompt in a fresh session and returns the agent's stdout (JSONL).
export function runCase({ agent, agentCmd, dir, model, prompt }) {
  const { args, command } = agentCommand({
    agent,
    agentCmd,
    dir,
    model,
    prompt,
  });
  const result = spawnSync(command, args, {
    cwd: dir,
    encoding: "utf8",
    env: scrubbedEnv(),
    maxBuffer: MAX_BUFFER,
    timeout: CASE_TIMEOUT_MS,
  });
  if (result.error)
    throw new Error(`${command} failed to run: ${result.error.message}`);
  if (result.status !== 0 && !result.stdout)
    throw new Error(
      `${command} exited ${result.status}: ${tail(result.stderr ?? "")}`
    );
  const log = result.stdout ?? "";
  const reported = agentError(log);
  if (reported) throw new Error(`${command} reported an error: ${reported}`);
  return log;
}

export function toResult(testCase, fired) {
  const result = {
    expect: testCase.expect,
    fired,
    passed: scoreCase(testCase, fired),
    prompt: testCase.prompt,
    skill: testCase.skill,
  };
  if (testCase.expect === "json") {
    result.should_not_use = testCase.should_not_use;
    result.should_use = testCase.should_use;
  }
  return result;
}

// Clones the repo at HEAD once, runs every case in it, then deletes the clone
// unless keep is set. Returns the results and the kept directory, if any.
export function evaluate({
  agent,
  agentCmd,
  cacheRoot = CACHE_ROOT,
  cases,
  keep = false,
  model,
  onResult,
  repo = repoRoot,
}) {
  mkdirSync(cacheRoot, { recursive: true });
  const workdir = mkdtempSync(join(cacheRoot, "run-"));
  const dir = join(workdir, "repo");
  try {
    const clone = spawnSync("git", ["clone", "--local", "--quiet", repo, dir], {
      encoding: "utf8",
      env: scrubbedEnv(),
    });
    if (clone.status !== 0)
      throw new Error(`git clone failed: ${(clone.stderr ?? "").trim()}`);
    const results = cases.map((testCase, index) => {
      const log = runCase({
        agent,
        agentCmd,
        dir,
        model,
        prompt: testCase.prompt,
      });
      const result = toResult(testCase, skillsFired(log, agent));
      onResult?.(result, index);
      return result;
    });
    return { results, workdir: keep ? workdir : null };
  } finally {
    if (!keep) rmSync(workdir, { force: true, recursive: true });
  }
}

export function resultLines({ agent, date, model, results }) {
  return results.map((result) =>
    JSON.stringify({
      agent,
      date,
      expect: result.expect,
      fired: result.fired,
      model: model ?? "default",
      passed: result.passed,
      prompt: result.prompt,
      skill: result.skill,
      ...(result.expect === "json"
        ? {
            should_not_use: result.should_not_use,
            should_use: result.should_use,
          }
        : {}),
    })
  );
}

// Keeps only the cases the flags ask for, in file order.
export function selectCases(cases, { skills = [], limit } = {}) {
  let selected = cases;
  if (skills.length > 0)
    selected = selected.filter((testCase) =>
      testCase.expect === "json"
        ? [...testCase.should_use, ...testCase.should_not_use].some((name) =>
            skills.includes(name)
          )
        : skills.includes(testCase.skill)
    );
  if (limit !== undefined) selected = selected.slice(0, limit);
  return selected;
}

const positiveInt = (text) => {
  const value = Number(text);
  return Number.isInteger(value) && value > 0 ? value : undefined;
};

const VALUE_FLAGS = {
  "--agent": "agent",
  "--agent-cmd": "agentCmd",
  "--model": "model",
};
const SWITCHES = { "--dry-run": "dryRun", "--json": "json", "--keep": "keep" };

export function parseArgs(argv) {
  const options = { dryRun: false, json: false, keep: false, skills: [] };
  let i = 0;
  // Consumes the value after a flag; a flag with no value is a usage error.
  const next = (flag) => {
    const value = argv[++i];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${flag} needs a value. ${USAGE}`);
    return value;
  };
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_FLAGS[arg]) options[VALUE_FLAGS[arg]] = next(arg);
    else if (arg === "--skill") options.skills.push(next(arg));
    else if (arg === "--limit") {
      options.limit = positiveInt(next(arg));
      if (options.limit === undefined)
        throw new Error(`--limit must be a positive integer. ${USAGE}`);
    } else if (SWITCHES[arg]) options[SWITCHES[arg]] = true;
    else throw new Error(`Unknown argument: ${arg}. ${USAGE}`);
  }
  if (!AGENTS.includes(options.agent))
    throw new Error(`--agent claude|codex is required. ${USAGE}`);
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  const cases = selectCases(loadCases(), options);
  if (cases.length === 0)
    throw new Error("No trigger cases match the selection");
  if (options.dryRun) {
    console.log(formatCaseList(cases));
    return 0;
  }
  const date = new Date().toISOString();
  const { results, workdir } = evaluate({
    agent: options.agent,
    agentCmd: options.agentCmd,
    cases,
    keep: options.keep,
    model: options.model,
    onResult: (result, index) => {
      if (!options.json)
        console.error(
          `[${index + 1}/${cases.length}] ${result.skill}: ${result.passed ? "pass" : "FAIL"} (fired: ${result.fired.join(", ") || "none"})`
        );
    },
  });
  mkdirSync(CACHE_ROOT, { recursive: true });
  appendFileSync(
    RESULTS_FILE,
    `${resultLines({ agent: options.agent, date, model: options.model, results }).join("\n")}\n`
  );
  const rows = summarize(results);
  if (options.json)
    console.log(
      JSON.stringify(
        {
          agent: options.agent,
          model: options.model ?? "default",
          results,
          rows,
        },
        null,
        2
      )
    );
  else console.log(formatTable(rows, options));
  if (workdir) console.log(`kept clone at ${workdir}`);
  return results.every((result) => result.passed) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = EXIT_ERROR;
  }
}
