import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  agentError,
  evaluate,
  formatTable,
  loadCases,
  parseArgs,
  parseTriggers,
  resultLines,
  scoreCase,
  selectCases,
  skillsFired,
  summarize,
} from "./skill-evals.mjs";

const UNKNOWN_AGENT = /Unknown agent/u;
const TABLE_HEADER = /agent: claude {2}model: m/u;
const CI_TRIAGE_ROW = /ci-triage +3 +2 +50% \(1\/2\)/u;
const THREE_OF_FOUR = /3\/4 cases passed/u;
const DEFAULT_MODEL = /model: default/u;
const AGENT_REQUIRED = /--agent claude\|codex is required/u;
const IS_REQUIRED = /is required/u;
const LIMIT_FLAG = /--limit/u;
const UNKNOWN_ARGUMENT = /Unknown argument/u;
const NEEDS_VALUE = /needs a value/u;

const claudeLog = [
  JSON.stringify({
    type: "system",
    subtype: "init",
    model: "claude-haiku-5-5",
  }),
  JSON.stringify({
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "Using the skill." },
        { type: "tool_use", name: "Skill", input: { skill: "ci-triage" } },
      ],
    },
  }),
  JSON.stringify({
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          name: "Skill",
          input: { skill: "my-plugin:commit" },
        },
      ],
    },
  }),
  // A Bash read of a SKILL.md is not a Skill tool call.
  JSON.stringify({
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          name: "Bash",
          input: { command: "cat .claude/skills/release/SKILL.md" },
        },
      ],
    },
  }),
  "not json at all",
].join("\n");

const codexLog = [
  JSON.stringify({ type: "thread.started", thread_id: "t1" }),
  JSON.stringify({
    type: "item.started",
    item: {
      id: "i1",
      type: "command_execution",
      command: "/bin/bash -lc 'cat .agents/skills/ci-triage/SKILL.md'",
    },
  }),
  JSON.stringify({
    type: "item.completed",
    item: {
      id: "i2",
      type: "command_execution",
      command: "sed -n 1,20p /work/.claude/skills/commit/SKILL.md",
    },
  }),
  JSON.stringify({
    type: "item.completed",
    item: { id: "i3", type: "command_execution", command: "ls .agents/skills" },
  }),
  // Agent prose that mentions a skill file is not command or tool input.
  JSON.stringify({
    type: "item.completed",
    item: {
      id: "i4",
      type: "agent_message",
      text: "I will read .claude/skills/release/SKILL.md next.",
    },
  }),
].join("\n");

test("parseTriggers reads both sections and ignores the rest", () => {
  const markdown = [
    "# ci-triage trigger cases",
    "",
    "## Should trigger",
    "",
    "- CI is red on my PR, find out why.",
    "- The Type Check job failed.",
    "",
    "## Should not trigger",
    "",
    "- Add a new GitHub Actions job.",
    "",
    "## Expected behaviour",
    "",
    "- Lists failing checks.",
  ].join("\n");
  assert.deepEqual(parseTriggers(markdown, "ci-triage"), [
    {
      expect: "trigger",
      prompt: "CI is red on my PR, find out why.",
      skill: "ci-triage",
    },
    {
      expect: "trigger",
      prompt: "The Type Check job failed.",
      skill: "ci-triage",
    },
    {
      expect: "no-trigger",
      prompt: "Add a new GitHub Actions job.",
      skill: "ci-triage",
    },
  ]);
});

test("parseTriggers returns nothing for a file without trigger sections", () => {
  assert.deepEqual(parseTriggers("# nothing here\n\n- a bullet\n", "x"), []);
});

test("skillsFired reads Claude Skill tool calls and strips plugin prefixes", () => {
  assert.deepEqual(skillsFired(claudeLog, "claude"), ["ci-triage", "commit"]);
});

test("skillsFired reads Codex SKILL.md reads from command text only", () => {
  assert.deepEqual(skillsFired(codexLog, "codex"), ["ci-triage", "commit"]);
});

test("skillsFired is empty for a session with no skill use", () => {
  assert.deepEqual(skillsFired("", "claude"), []);
  assert.deepEqual(skillsFired("", "codex"), []);
});

test("skillsFired rejects an unknown agent", () => {
  assert.throws(() => skillsFired(claudeLog, "gemini"), UNKNOWN_AGENT);
});

test("scoreCase passes trigger cases only when the skill fired", () => {
  const trigger = { expect: "trigger", prompt: "p", skill: "ci-triage" };
  assert.equal(scoreCase(trigger, ["ci-triage"]), true);
  assert.equal(scoreCase(trigger, ["commit"]), false);
});

test("scoreCase passes no-trigger cases only when the skill stayed silent", () => {
  const near = { expect: "no-trigger", prompt: "p", skill: "ci-triage" };
  assert.equal(scoreCase(near, ["commit"]), true);
  assert.equal(scoreCase(near, ["ci-triage"]), false);
});

test("scoreCase checks JSON cases on both lists", () => {
  const item = {
    expect: "json",
    prompt: "p",
    should_not_use: ["release"],
    should_use: ["commit"],
    skill: "(json cases)",
  };
  assert.equal(scoreCase(item, ["commit"]), true);
  assert.equal(scoreCase(item, []), false);
  assert.equal(scoreCase(item, ["commit", "release"]), false);
});

test("summarize gives per-skill counts and trigger rates", () => {
  const results = [
    {
      expect: "trigger",
      fired: ["ci-triage"],
      passed: true,
      prompt: "a",
      skill: "ci-triage",
    },
    {
      expect: "trigger",
      fired: [],
      passed: false,
      prompt: "b",
      skill: "ci-triage",
    },
    {
      expect: "no-trigger",
      fired: [],
      passed: true,
      prompt: "c",
      skill: "ci-triage",
    },
    {
      expect: "trigger",
      fired: ["commit"],
      passed: true,
      prompt: "d",
      skill: "commit",
    },
  ];
  const rows = summarize(results);
  assert.deepEqual(rows[0], {
    cases: 3,
    expected: 2,
    hits: 1,
    passed: 2,
    skill: "ci-triage",
    triggerRate: 0.5,
  });
  assert.equal(rows[1].triggerRate, 1);
  const table = formatTable(rows, { agent: "claude", model: "m" });
  assert.match(table, TABLE_HEADER);
  assert.match(table, CI_TRIAGE_ROW);
  assert.match(table, THREE_OF_FOUR);
});

test("summarize reports no trigger rate for no-trigger-only skills", () => {
  const rows = summarize([
    { expect: "no-trigger", fired: [], passed: true, prompt: "x", skill: "s" },
  ]);
  assert.equal(rows[0].triggerRate, null);
  assert.match(formatTable(rows, {}), DEFAULT_MODEL);
});

test("resultLines writes one record per case with the agreed fields", () => {
  const [line] = resultLines({
    agent: "codex",
    date: "2026-10-20T00:00:00.000Z",
    model: undefined,
    results: [
      {
        expect: "trigger",
        fired: ["ci-triage"],
        passed: true,
        prompt: "p",
        skill: "ci-triage",
      },
    ],
  });
  assert.deepEqual(JSON.parse(line), {
    agent: "codex",
    date: "2026-10-20T00:00:00.000Z",
    expect: "trigger",
    fired: ["ci-triage"],
    model: "default",
    passed: true,
    prompt: "p",
    skill: "ci-triage",
  });
});

test("selectCases filters by skill and limit, keeping file order", () => {
  const cases = [
    { expect: "trigger", prompt: "1", skill: "ci-triage" },
    { expect: "trigger", prompt: "2", skill: "commit" },
    { expect: "no-trigger", prompt: "3", skill: "ci-triage" },
    {
      expect: "json",
      prompt: "4",
      should_not_use: ["release"],
      should_use: ["ci-triage"],
      skill: "(json cases)",
    },
  ];
  assert.deepEqual(
    selectCases(cases, { skills: ["ci-triage"] }).map((item) => item.prompt),
    ["1", "3", "4"]
  );
  assert.deepEqual(
    selectCases(cases, { limit: 2 }).map((item) => item.prompt),
    ["1", "2"]
  );
});

test("parseArgs requires --agent and rejects bad values", () => {
  assert.throws(() => parseArgs([]), AGENT_REQUIRED);
  assert.throws(() => parseArgs(["--agent", "gemini"]), IS_REQUIRED);
  assert.throws(
    () => parseArgs(["--agent", "claude", "--limit", "0"]),
    LIMIT_FLAG
  );
  assert.throws(
    () => parseArgs(["--agent", "claude", "--bogus"]),
    UNKNOWN_ARGUMENT
  );
  assert.throws(() => parseArgs(["--agent", "claude", "--model"]), NEEDS_VALUE);
});

test("parseArgs reads the flags", () => {
  const options = parseArgs([
    "--agent",
    "codex",
    "--model",
    "gpt-x",
    "--skill",
    "a",
    "--skill",
    "b",
    "--limit",
    "3",
    "--json",
    "--keep",
    "--dry-run",
  ]);
  assert.deepEqual(options, {
    agent: "codex",
    dryRun: true,
    json: true,
    keep: true,
    limit: 3,
    model: "gpt-x",
    skills: ["a", "b"],
  });
});

test("loadCases reads every triggers.md and the JSON cases", () => {
  const root = mkdtempSync(join(tmpdir(), "skill-evals-load-"));
  try {
    const dir = join(root, ".claude", "skills", "demo", "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "triggers.md"),
      "## Should trigger\n\n- one\n\n## Should not trigger\n\n- near\n"
    );
    const jsonFile = join(root, "cases.json");
    writeFileSync(
      jsonFile,
      JSON.stringify([
        { prompt: "j", should_use: ["demo"], should_not_use: [] },
      ])
    );
    const cases = loadCases({ jsonFile, root });
    assert.deepEqual(
      cases.map((item) => [item.skill, item.expect, item.prompt]),
      [
        ["demo", "trigger", "one"],
        ["demo", "no-trigger", "near"],
        ["(json cases)", "json", "j"],
      ]
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("agentError reports a Claude login failure and stays quiet otherwise", () => {
  const failed = JSON.stringify({
    type: "result",
    is_error: true,
    result: "Failed to authenticate: OAuth session expired",
  });
  assert.equal(agentError(claudeLog), undefined);
  assert.equal(
    agentError(failed),
    "Failed to authenticate: OAuth session expired"
  );
});

test("agentError ignores a Claude turn limit and skillsFired still sees the skill", () => {
  const maxTurns = [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Skill", input: { skill: "ci-triage" } },
        ],
      },
    }),
    JSON.stringify({
      type: "result",
      is_error: true,
      subtype: "error_max_turns",
      result: null,
    }),
  ].join("\n");
  assert.equal(agentError(maxTurns), undefined);
  assert.deepEqual(skillsFired(maxTurns, "claude"), ["ci-triage"]);
});

test("evaluate runs cases through a fake agent in a clone and removes it", () => {
  const work = mkdtempSync(join(tmpdir(), "skill-evals-run-"));
  try {
    // A throwaway repo at HEAD; the fake agent only sees the clone's path.
    const repo = join(work, "repo");
    mkdirSync(repo);
    const git = (...args) =>
      spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
        cwd: repo,
        encoding: "utf8",
      });
    git("init", "--quiet");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    git("add", "README.md");
    assert.equal(git("commit", "--quiet", "-m", "fixture").status, 0);

    // Fake agent: prints a Skill tool call when the prompt says "fire".
    const fake = join(work, "fake-agent.mjs");
    writeFileSync(
      fake,
      [
        "#!/usr/bin/env node",
        "const prompt = process.argv[2];",
        "if (prompt.includes('fire')) console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'ci-triage' } }] } }));",
        "",
      ].join("\n")
    );
    chmodSync(fake, 0o755);

    const cacheRoot = join(work, "cache");
    const cases = [
      { expect: "trigger", prompt: "please fire", skill: "ci-triage" },
      { expect: "no-trigger", prompt: "quiet", skill: "ci-triage" },
    ];
    const { results, workdir } = evaluate({
      agentCmd: fake,
      agent: "claude",
      cacheRoot,
      cases,
      repo,
    });
    assert.equal(workdir, null);
    assert.deepEqual(
      results.map((result) => [result.fired, result.passed]),
      [
        [["ci-triage"], true],
        [[], true],
      ]
    );
    const leftovers = readdirSync(cacheRoot).filter((name) =>
      name.startsWith("run-")
    );
    assert.deepEqual(leftovers, [], "clone should be deleted without --keep");
  } finally {
    rmSync(work, { force: true, recursive: true });
  }
});
