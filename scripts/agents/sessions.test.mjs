import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  belongsToRepo,
  claudeBinary,
  claudeSlug,
  codexSessionDirs,
  digest,
  findSessions,
  linuxPath,
  parseClaude,
  parseCodex,
} from "./sessions.mjs";

const FIX_THE_ROSTER_RE = /Fix the roster export/u;
const PNPM_TEST_RE = /pnpm test/u;
const DONE_EXPORT_FIXED_RE = /Done: export fixed\./u;

const lines = (...events) => events.map((e) => JSON.stringify(e)).join("\n");
const usage = {
  input_tokens: 10,
  cache_read_input_tokens: 100,
  output_tokens: 5,
};

const claudeLog = lines(
  { type: "queue-operation", operation: "enqueue" },
  {
    type: "user",
    cwd: "/repo",
    gitBranch: "feat/x",
    sessionId: "s1",
    timestamp: "2026-10-20T10:00:00.000Z",
    message: { role: "user", content: "Fix the roster export" },
  },
  {
    type: "assistant",
    cwd: "/repo",
    gitBranch: "feat/x",
    timestamp: "2026-10-20T10:01:00.000Z",
    message: {
      id: "m1",
      model: "claude-sonnet-5-5",
      usage,
      content: [
        { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
      ],
    },
  },
  {
    // Same API message, second block: usage must not be counted twice.
    type: "assistant",
    gitBranch: "feat/x",
    timestamp: "2026-10-20T10:02:00.000Z",
    message: {
      id: "m1",
      model: "claude-sonnet-5-5",
      usage,
      content: [
        { type: "tool_use", name: "Edit", input: { file_path: "/repo/a.ts" } },
        { type: "tool_use", name: "Skill", input: { skill: "plugin:commit" } },
      ],
    },
  },
  {
    type: "user",
    timestamp: "2026-10-20T10:03:00.000Z",
    message: {
      content: [{ type: "tool_result", content: "ok" }],
    },
  },
  {
    type: "user",
    timestamp: "2026-10-20T10:03:30.000Z",
    message: { content: "<task-notification>done</task-notification>" },
  },
  {
    type: "user",
    isMeta: true,
    timestamp: "2026-10-20T10:03:40.000Z",
    message: { content: "meta text" },
  },
  {
    type: "assistant",
    timestamp: "2026-10-20T12:00:00.000Z",
    message: {
      id: "m2",
      model: "claude-sonnet-5-5",
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: "Done: export fixed." }],
    },
  }
);

test("parseClaude counts each API message once and only human prompts", () => {
  const sub = lines({
    type: "assistant",
    gitBranch: "feat/x",
    timestamp: "2026-10-20T10:02:30.000Z",
    message: {
      id: "sub1",
      model: "claude-haiku-5-5",
      usage: { input_tokens: 4, output_tokens: 2 },
      content: [{ type: "tool_use", name: "Read", input: {} }],
    },
  });
  const s = parseClaude(claudeLog, { extra: [sub], file: "f", id: "s1" });
  assert.equal(s.agent, "claude");
  assert.equal(s.cwd, "/repo");
  assert.deepEqual(s.prompts, ["Fix the roster export"]);
  assert.deepEqual(s.tokens, { cached: 100, input: 15, output: 8, total: 123 });
  assert.equal(s.model, "claude-sonnet-5-5");
  assert.deepEqual(s.toolCounts, { Bash: 1, Edit: 1, Read: 1, Skill: 1 });
  assert.deepEqual(s.skills, ["commit"]);
  assert.deepEqual(s.edits, ["/repo/a.ts"]);
  assert.equal(s.subagents, 1);
  assert.equal(s.finalText, "Done: export fixed.");
  assert.equal(s.branches["feat/x"], 121);
  // 10:00 → 10:03:40 is active; the two-hour gap counts as five minutes.
  assert.equal(s.minutes, 8.7);
});

test("parseCodex reads cumulative usage, commands, edits and skills", () => {
  const log = lines(
    {
      type: "session_meta",
      timestamp: "2026-10-20T10:00:00.000Z",
      payload: { id: "c1", cwd: "/repo" },
    },
    { type: "turn_context", payload: { model: "gpt-6-luna" } },
    {
      type: "event_msg",
      timestamp: "2026-10-20T10:00:10.000Z",
      payload: {
        type: "item_completed",
        item: {
          type: "UserMessage",
          content: [
            { type: "text", text: "<environment_context>x" },
            { type: "text", text: "Add a test" },
          ],
        },
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "item_completed",
        item: {
          type: "CommandExecution",
          command: ["/bin/bash", "-lc", "cat .agents/skills/tdd/SKILL.md"],
        },
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "item_completed",
        item: { type: "FileChange", changes: { "/repo/t.py": {} } },
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 50,
            cached_input_tokens: 30,
            output_tokens: 7,
          },
        },
      },
    },
    {
      type: "event_msg",
      timestamp: "2026-10-20T10:02:00.000Z",
      payload: {
        type: "item_completed",
        item: {
          type: "AgentMessage",
          content: [{ type: "Text", text: "Added." }],
        },
      },
    }
  );
  const s = parseCodex(log, { file: "r.jsonl" });
  assert.equal(s.id, "c1");
  assert.equal(s.model, "gpt-6-luna");
  assert.deepEqual(s.prompts, ["Add a test"]);
  assert.deepEqual(s.tokens, { cached: 30, input: 20, output: 7, total: 57 });
  assert.deepEqual(s.skills, ["tdd"]);
  assert.deepEqual(s.edits, ["/repo/t.py"]);
  assert.equal(s.finalText, "Added.");
  assert.equal(s.minutes, 2);
});

test("belongsToRepo covers the checkout, nested and sibling worktrees", () => {
  assert.ok(belongsToRepo("/h/grenmet", "/h/grenmet"));
  assert.ok(belongsToRepo("/h/grenmet/.claude/worktrees/x", "/h/grenmet"));
  assert.ok(belongsToRepo("/h/grenmet-wt-agents/a.ts", "/h/grenmet"));
  assert.ok(belongsToRepo("file:///h/grenmet/apps", "/h/grenmet"));
  assert.ok(!belongsToRepo("/h/grenmetx", "/h/grenmet"));
  assert.ok(!belongsToRepo("/h/bishop", "/h/grenmet"));
  assert.ok(!belongsToRepo(undefined, "/h/grenmet"));
});

test("digest keeps the request and the outcome when it must cut", () => {
  const s = parseClaude(claudeLog, { id: "s1" });
  const full = digest(s);
  assert.match(full, FIX_THE_ROSTER_RE);
  assert.match(full, PNPM_TEST_RE);
  const short = digest(
    { ...s, commands: new Array(500).fill("x".repeat(100)) },
    2000
  );
  assert.ok(short.length < 2100);
  assert.match(short, FIX_THE_ROSTER_RE);
  assert.match(short, DONE_EXPORT_FIXED_RE);
});

test("findSessions reads only this repo's folders and recent files", () => {
  const home = mkdtempSync(join(tmpdir(), "sessions-"));
  try {
    const root = "/h/grenmet";
    const mine = join(home, ".claude/projects", claudeSlug(root));
    const worktree = join(
      home,
      ".claude/projects",
      `${claudeSlug(root)}--claude-worktrees-a`
    );
    const other = join(home, ".claude/projects", claudeSlug("/h/bishop"));
    for (const dir of [mine, worktree, other])
      mkdirSync(dir, { recursive: true });
    writeFileSync(join(mine, "s1.jsonl"), claudeLog);
    writeFileSync(join(worktree, "s2.jsonl"), claudeLog.replaceAll("s1", "s2"));
    writeFileSync(join(other, "s3.jsonl"), claudeLog);
    const old = join(mine, "old.jsonl");
    writeFileSync(old, claudeLog);
    const longAgo = new Date("2026-01-01");
    utimesSync(old, longAgo, longAgo);
    const now = Date.parse("2026-10-21T00:00:00Z");
    const ids = findSessions({ days: 7, home, now, root })
      .map((s) => s.id)
      .sort();
    assert.deepEqual(ids, ["s1", "s2"]);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("linuxPath turns Codex desktop UNC paths into WSL paths", () => {
  assert.equal(
    linuxPath("\\\\wsl.localhost\\Ubuntu-26.04\\home\\eugine\\grenmet"),
    "/home/eugine/grenmet"
  );
  assert.equal(linuxPath("file:///home/x"), "/home/x");
  assert.equal(linuxPath("/a/b"), "/a/b");
});

test("codexSessionDirs keeps only homes that have sessions", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-"));
  try {
    const custom = join(home, "custom");
    mkdirSync(join(custom, "sessions"), { recursive: true });
    assert.deepEqual(
      codexSessionDirs(home, { CODEX_HOME: custom }).filter((d) =>
        d.startsWith(home)
      ),
      [join(custom, "sessions")]
    );
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

test("claudeBinary prefers CLAUDE_BIN", () => {
  assert.equal(claudeBinary({ CLAUDE_BIN: "/opt/claude" }), "/opt/claude");
});
