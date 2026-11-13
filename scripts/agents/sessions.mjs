#!/usr/bin/env node
// The factory's data layer: every Claude Code and Codex session that touched this
// repository, read from the transcripts both tools already keep on this machine
// (~/.claude/projects/<slug>/*.jsonl, subagents included, and
// ~/.codex/sessions/**/*.jsonl). Nothing is copied or uploaded: transcripts hold
// private context, so they stay local and only derived numbers leave the machine.
//
// Usage: node scripts/agents/sessions.mjs [--days 7] [--json]
//          [--branch <name>] [--latest]   (--latest: newest session for this cwd)
// Other scripts import findSessions(), parseClaude(), parseCodex() and digest().

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mainCheckoutRoot } from "../../.claude/hooks/main-checkout.mjs";

const SKILL_FILE_PATH_RE =
  /(?:\.agents|\.claude)\/skills\/([\w-]+)\/SKILL\.md/u;
const WSL_UNC_PATH_RE = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)?$/u;
const FILE_URL_PREFIX_RE = /^file:\/\//u;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAY_MS = 86_400_000;
const IDLE_MS = 5 * 60_000;
const DEFAULT_DAYS = 7;
const PROMPT_CHARS = 600;
const COMMAND_CHARS = 200;
const FINAL_CHARS = 1500;
const DIGEST_CHARS = 24_000;

// Text the harness injects as a "user" turn; none of it is a human typing.
const INJECTED = [
  "<task-notification",
  "<local-command",
  "<command-",
  "<system-reminder",
  "<environment_context",
  "<user_instructions",
  "<turn_aborted",
  "# AGENTS.md instructions",
  "Caveat:",
  "[Request interrupted",
];
const isHumanText = (text) =>
  typeof text === "string" &&
  text.trim() !== "" &&
  !INJECTED.some((prefix) => text.trimStart().startsWith(prefix));

const clip = (text, max) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

function jsonLines(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A transcript being written can end in a partial line.
    }
  }
  return events;
}

function emptySession(agent, id, file) {
  return {
    agent,
    branches: {},
    commands: [],
    cwd: undefined,
    edits: [],
    end: undefined,
    file,
    finalText: "",
    id,
    models: {},
    prompts: [],
    skills: [],
    start: undefined,
    subagents: 0,
    times: [],
    tokens: { cached: 0, input: 0, output: 0, total: 0 },
    toolCounts: {},
  };
}

function stamp(session, timestamp) {
  if (!timestamp) return;
  session.times.push(Date.parse(timestamp));
  if (session.start === undefined || timestamp < session.start)
    session.start = timestamp;
  if (session.end === undefined || timestamp > session.end)
    session.end = timestamp;
}

function finish(session) {
  const model = Object.entries(session.models).sort((a, b) => b[1] - a[1])[0];
  session.model = model?.[0];
  session.edits = [...new Set(session.edits)];
  session.skills = [...new Set(session.skills)];
  // Active time: gaps longer than IDLE_MS (a resumed session, a lunch break)
  // count as IDLE_MS, so a session reopened days later is not days long.
  const times = session.times.filter(Number.isFinite).sort((a, b) => a - b);
  let active = 0;
  for (let i = 1; i < times.length; i += 1)
    active += Math.min(times[i] - times[i - 1], IDLE_MS);
  session.minutes = Math.round(active / 6000) / 10;
  const { times: _times, ...rest } = session;
  return rest;
}

const count = (map, key, amount = 1) => {
  map[key] = (map[key] ?? 0) + amount;
};

function claudeTool(session, block) {
  const name = block.name ?? "unknown";
  count(session.toolCounts, name);
  const input = block.input ?? {};
  if (name === "Bash" && typeof input.command === "string")
    session.commands.push(clip(input.command, COMMAND_CHARS));
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(name)) {
    const path = input.file_path ?? input.notebook_path;
    if (typeof path === "string") session.edits.push(path);
  }
  if (name === "Skill" && typeof input.skill === "string")
    session.skills.push(input.skill.split(":").at(-1));
}

// One Claude Code transcript. `extra` holds the subagent transcripts of the same
// session; their tokens and tools count toward it, their prompts do not (a
// subagent's "user" turn is the parent agent, not a person).
export function parseClaude(text, { extra = [], file, id } = {}) {
  const session = emptySession("claude", id, file);
  const seen = new Set();
  const read = (events, isMain) => {
    for (const event of events) {
      if (event.type !== "user" && event.type !== "assistant") continue;
      stamp(session, event.timestamp);
      session.id ??= event.sessionId;
      if (isMain && event.cwd) session.cwd ??= event.cwd;
      const message = event.message ?? {};
      const content = message.content;
      if (event.type === "user") {
        if (!isMain || event.isMeta || event.isSidechain) continue;
        const texts =
          typeof content === "string"
            ? [content]
            : (Array.isArray(content) ? content : [])
                .filter((b) => b.type === "text")
                .map((b) => b.text);
        for (const t of texts.filter(isHumanText))
          session.prompts.push(clip(t.trim(), PROMPT_CHARS));
        continue;
      }
      const blocks = Array.isArray(content) ? content : [];
      for (const block of blocks) {
        if (block.type === "tool_use") claudeTool(session, block);
        if (isMain && block.type === "text" && block.text?.trim())
          session.finalText = block.text.trim();
      }
      const usage = message.usage;
      // One API message is split over several transcript lines that repeat its
      // usage; count each message id once.
      if (!usage || (message.id && seen.has(message.id))) continue;
      if (message.id) seen.add(message.id);
      const input = usage.input_tokens ?? 0;
      const cached =
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
      const output = usage.output_tokens ?? 0;
      session.tokens.input += input;
      session.tokens.cached += cached;
      session.tokens.output += output;
      session.tokens.total += input + cached + output;
      if (message.model && message.model !== "<synthetic>")
        count(session.models, message.model, output);
      if (event.gitBranch)
        count(session.branches, event.gitBranch, input + cached + output);
    }
  };
  read(jsonLines(text), true);
  for (const sub of extra) read(jsonLines(sub), false);
  session.subagents = extra.length;
  session.finalText = clip(session.finalText, FINAL_CHARS);
  return finish(session);
}

function codexItem(session, item) {
  if (item.type === "UserMessage") {
    for (const part of item.content ?? [])
      if (isHumanText(part.text))
        session.prompts.push(clip(part.text.trim(), PROMPT_CHARS));
  } else if (item.type === "AgentMessage") {
    const text = (item.content ?? []).map((p) => p.text ?? "").join("");
    if (text.trim()) session.finalText = text.trim();
  } else if (item.type === "CommandExecution") {
    count(session.toolCounts, "exec");
    const command = Array.isArray(item.command)
      ? item.command.at(-1)
      : item.command;
    if (typeof command === "string")
      session.commands.push(clip(command, COMMAND_CHARS));
    const skill = SKILL_FILE_PATH_RE.exec(String(command));
    if (skill) session.skills.push(skill[1]);
  } else if (item.type === "FileChange") {
    count(session.toolCounts, "apply_patch");
    session.edits.push(...Object.keys(item.changes ?? {}));
  }
}

// One Codex rollout file. Codex reports cumulative usage on every token_count
// event and counts cached tokens inside input_tokens.
export function parseCodex(text, { file } = {}) {
  const session = emptySession("codex", undefined, file);
  let usage;
  let branchHint;
  for (const event of jsonLines(text)) {
    stamp(session, event.timestamp);
    const payload = event.payload ?? {};
    if (event.type === "session_meta") {
      session.id = payload.id ?? payload.session_id;
      session.cwd = payload.cwd ? linuxPath(payload.cwd) : undefined;
      branchHint = payload.git?.branch;
    } else if (event.type === "turn_context" && payload.model) {
      count(session.models, payload.model);
    } else if (payload.type === "token_count" && payload.info) {
      usage = payload.info.total_token_usage;
    } else if (payload.type === "item_completed" && payload.item) {
      codexItem(session, payload.item);
    }
  }
  if (usage) {
    const cached = usage.cached_input_tokens ?? 0;
    session.tokens.input = (usage.input_tokens ?? 0) - cached;
    session.tokens.cached = cached;
    session.tokens.output = usage.output_tokens ?? 0;
    session.tokens.total = (usage.input_tokens ?? 0) + session.tokens.output;
  }
  if (branchHint) session.branches[branchHint] = session.tokens.total;
  session.finalText = clip(session.finalText, FINAL_CHARS);
  return finish(session);
}

// Claude Code names a project folder after its path with every non-alphanumeric
// character replaced by "-".
export const claudeSlug = (path) => path.replace(/[^a-zA-Z0-9]/gu, "-");

// The Codex desktop app on Windows records WSL paths as UNC paths
// (\\wsl.localhost\<distro>\home\…); turn them back into Linux paths.
export function linuxPath(path) {
  const unc = WSL_UNC_PATH_RE.exec(path);
  const clean = unc ? (unc[1] ?? "/").replaceAll("\\", "/") : path;
  return clean.replace(FILE_URL_PREFIX_RE, "");
}

// The main checkout and every worktree of it: `.claude/worktrees/*` inside it and
// `<main>-wt-*` beside it.
export function belongsToRepo(path, root) {
  if (typeof path !== "string") return false;
  const clean = linuxPath(path);
  return (
    clean === root ||
    clean.startsWith(`${root}${sep}`) ||
    clean.startsWith(`${root}-wt-`)
  );
}

function walk(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else if (entry.name.endsWith(".jsonl")) found.push(path);
  }
  return found;
}

const readText = (file) => readFileSync(file, "utf8");

function claudeSessions({ home, root, since }) {
  const projects = join(home, ".claude", "projects");
  if (!existsSync(projects)) return [];
  const slug = claudeSlug(root);
  const sessions = [];
  for (const dir of readdirSync(projects)) {
    if (dir !== slug && !dir.startsWith(`${slug}-`)) continue;
    const folder = join(projects, dir);
    for (const name of readdirSync(folder)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(folder, name);
      if (statSync(file).mtimeMs < since) continue;
      const id = name.slice(0, -".jsonl".length);
      const subDir = join(folder, id, "subagents");
      const extra = existsSync(subDir)
        ? readdirSync(subDir)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => readText(join(subDir, f)))
        : [];
      sessions.push(parseClaude(readText(file), { extra, file, id }));
    }
  }
  return sessions;
}

// Codex homes: $CODEX_HOME, ~/.codex, and the Windows profiles a WSL install
// can see (the Codex desktop app keeps its sessions there).
export function codexSessionDirs(home, env = process.env) {
  const dirs = [env.CODEX_HOME, join(home, ".codex")].filter(Boolean);
  const windowsUsers = "/mnt/c/Users";
  if (existsSync(windowsUsers))
    for (const user of readdirSync(windowsUsers))
      dirs.push(join(windowsUsers, user, ".codex"));
  return [...new Set(dirs)]
    .map((dir) => join(dir, "sessions"))
    .filter((dir) => existsSync(dir));
}

function codexSessions({ home, root, since }) {
  const sessions = [];
  const files = codexSessionDirs(home).flatMap((dir) => walk(dir));
  for (const file of files) {
    if (statSync(file).mtimeMs < since) continue;
    const session = parseCodex(readText(file), { file });
    const touched =
      belongsToRepo(session.cwd, root) ||
      session.edits.some((path) => belongsToRepo(path, root)) ||
      session.commands.some((c) => c.includes(root));
    if (touched) sessions.push(session);
  }
  return sessions;
}

// Sessions for this repository, newest first, that had at least one human prompt
// or tool call (empty or aborted sessions are noise).
export function findSessions({
  days = DEFAULT_DAYS,
  home = homedir(),
  now = Date.now(),
  root = mainCheckoutRoot(repoRoot),
} = {}) {
  const since = now - days * DAY_MS;
  return [
    ...claudeSessions({ home, root, since }),
    ...codexSessions({ home, root, since }),
  ]
    .filter(
      (s) =>
        s.end &&
        Date.parse(s.end) >= since &&
        (s.prompts.length > 0 || Object.keys(s.toolCounts).length > 0)
    )
    .sort((a, b) => b.end.localeCompare(a.end));
}

// A compact, bounded text view of one session for an LLM judge: what the human
// asked, what the agent ran and changed, and what it said at the end.
export function digest(session, maxChars = DIGEST_CHARS) {
  const tools = Object.entries(session.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name}×${n}`)
    .join(", ");
  const sections = [
    `Agent: ${session.agent} (${session.model ?? "unknown model"}), ${session.minutes} min, ${session.tokens.total} tokens, ${session.subagents} subagents`,
    `Branches: ${Object.keys(session.branches).join(", ") || "unknown"}`,
    `Tools: ${tools || "none"}`,
    `Skills used: ${session.skills.join(", ") || "none"}`,
    "",
    "## Human prompts",
    ...session.prompts.map((p, i) => `${i + 1}. ${p}`),
    "",
    "## Files edited",
    ...session.edits.map((p) => `- ${p}`),
    "",
    "## Shell commands (in order)",
    ...session.commands.map((c) => `- ${c}`),
    "",
    "## Final message",
    session.finalText,
  ];
  const text = sections.join("\n");
  if (text.length <= maxChars) return text;
  // Keep the start and the end: the request and the outcome matter most.
  const half = Math.floor(maxChars / 2);
  return `${text.slice(0, half)}\n…[${text.length - maxChars} characters cut]…\n${text.slice(-half)}`;
}

// Newest session whose working directory is `cwd` (for run records).
export function latestSession(cwd = process.cwd(), options = {}) {
  return findSessions({ days: 2, ...options }).find((s) => s.cwd === cwd);
}

// The Claude CLI: $CLAUDE_BIN, `claude` on PATH, or the newest copy the Claude
// desktop app installs for WSL.
export function claudeBinary(env = process.env, home = homedir()) {
  if (env.CLAUDE_BIN) return env.CLAUDE_BIN;
  const onPath = spawnSync("sh", ["-c", "command -v claude"], {
    encoding: "utf8",
  });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
  const desktop = join(home, ".claude", "remote", "ccd-cli");
  if (existsSync(desktop)) {
    const newest = readdirSync(desktop).sort().at(-1);
    if (newest) return join(desktop, newest);
  }
  return "claude";
}

const fmtTokens = (n) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : `${Math.round(n / 1000)}k`;

export function formatSessions(sessions) {
  const rows = sessions.map((s) =>
    [
      s.end.slice(0, 16).replace("T", " "),
      s.agent.padEnd(6),
      (s.model ?? "?").padEnd(18),
      fmtTokens(s.tokens.total).padStart(6),
      String(s.prompts.length).padStart(3),
      String(s.minutes).padStart(6),
      Object.keys(s.branches).join(",").slice(0, 40),
    ].join("  ")
  );
  return [
    `${sessions.length} session(s)`,
    "end               agent   model               tokens  hp  minutes  branches",
    ...rows,
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (args.includes("--latest")) {
    const session = latestSession();
    console.log(JSON.stringify(session ?? null, null, 2));
  } else {
    let sessions = findSessions({
      days: Number(option("--days") ?? DEFAULT_DAYS),
    });
    const branch = option("--branch");
    if (branch) sessions = sessions.filter((s) => branch in s.branches);
    console.log(
      args.includes("--json")
        ? JSON.stringify(sessions, null, 2)
        : formatSessions(sessions)
    );
  }
}
