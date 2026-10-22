import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildJudgePrompt,
  formatSummary,
  judgeCommand,
  loadScorers,
  parseScorer,
  parseVerdict,
  runJudge,
  sampled,
  scoreRecord,
  selectWork,
  summarizeScores,
} from "./score-sessions.mjs";

const PASS_RE = /\*\*Pass\*\*/;
const FAIL_RE = /\*\*Fail\*\*/;
const PASS_FIRST_RE = /^\*\*Pass\*\*/;
const MISSING_FRONTMATTER_RE = /missing frontmatter/;
const SAMPLE_MUST_BE_RE = /sample must be/;
const NO_VERDICT_RE = /no verdict/;
const RUBRIC_DEMO_RE = /# Rubric: demo/;
const FIRST_PROMPT_RE = /1\. hi/;
const JUDGE_MUST_BE_RE = /--judge must be/;
const DEMO_SUMMARY_RE = /demo\s+1\s+1\s+1\s+50%\s+W43 50%/;

const SCORER = `---
name: demo
description: Demo rubric.
sample: 1
min_tools: 2
---

**Pass** when fine.
`;

test("every checked-in scorer parses and has a unique name", () => {
  const scorers = loadScorers();
  assert.ok(scorers.length >= 5);
  const names = scorers.map((s) => s.name);
  assert.equal(new Set(names).size, names.length);
  for (const s of scorers) {
    assert.match(s.rubric, PASS_RE, `${s.name} has a Pass rule`);
    assert.match(s.rubric, FAIL_RE, `${s.name} has a Fail rule`);
  }
});

test("parseScorer reads frontmatter and versions the rubric", () => {
  const scorer = parseScorer(SCORER);
  assert.equal(scorer.name, "demo");
  assert.equal(scorer.sample, 1);
  assert.equal(scorer.minTools, 2);
  assert.match(scorer.rubric, PASS_FIRST_RE);
  assert.notEqual(parseScorer(`${SCORER}\nmore`).version, scorer.version);
  assert.throws(() => parseScorer("no frontmatter"), MISSING_FRONTMATTER_RE);
  assert.throws(
    () => parseScorer(SCORER.replace("sample: 1", "sample: 2")),
    SAMPLE_MUST_BE_RE
  );
});

test("sampling is stable and roughly matches the rate", () => {
  const scorer = { name: "x", sample: 0.3 };
  assert.equal(sampled("abc", scorer), sampled("abc", scorer));
  const hits = Array.from({ length: 2000 }, (_, i) => sampled(`s${i}`, scorer));
  const share = hits.filter(Boolean).length / hits.length;
  assert.ok(share > 0.25 && share < 0.35, `share ${share}`);
});

const session = (id, end, tools = 5) => ({
  agent: "claude",
  branches: { "feat/x": 1 },
  end,
  id,
  model: "claude-sonnet-5-5",
  toolCounts: { Bash: tools },
});

test("selectWork skips fresh, small and already scored sessions", () => {
  const scorer = parseScorer(SCORER);
  const now = Date.parse("2026-10-20T12:00:00Z");
  const sessions = [
    session("fresh", "2026-10-20T11:50:00Z"),
    session("small", "2026-10-20T09:00:00Z", 1),
    session("done", "2026-10-20T09:00:00Z"),
    session("todo", "2026-10-20T09:00:00Z"),
  ];
  const done = new Set([`done:demo:${scorer.version}`]);
  const work = selectWork({ done, now, scorers: [scorer], sessions });
  assert.deepEqual(
    work.map((w) => w.session.id),
    ["todo"]
  );
  assert.equal(
    selectWork({ done, limit: 0, now, scorers: [scorer], sessions }).length,
    0
  );
});

test("parseVerdict finds the JSON in a chatty reply", () => {
  assert.deepEqual(
    parseVerdict(
      'Sure.\n```json\n{"verdict": "fail", "evidence": "no tests run", "suggestion": "say run tests"}\n```'
    ),
    { evidence: "no tests run", suggestion: "say run tests", verdict: "fail" }
  );
  assert.equal(parseVerdict('{"verdict":"n/a"}').verdict, "n/a");
  assert.throws(() => parseVerdict('{"verdict":"maybe"}'), NO_VERDICT_RE);
  assert.throws(() => parseVerdict("nothing"), NO_VERDICT_RE);
});

test("the judge prompt carries rubric and record, and the CLI runs bare", () => {
  const prompt = buildJudgePrompt(
    parseScorer(SCORER),
    "## Human prompts\n1. hi"
  );
  assert.match(prompt, RUBRIC_DEMO_RE);
  assert.match(prompt, FIRST_PROMPT_RE);
  const claude = judgeCommand({ judge: "claude", model: "claude-haiku-5-5" });
  assert.ok(claude.args.includes("--no-session-persistence"));
  assert.equal(claude.args[claude.args.indexOf("--tools") + 1], "");
  assert.equal(claude.args[claude.args.indexOf("--setting-sources") + 1], "");
  const codex = judgeCommand({ judge: "codex", outFile: "/tmp/o" });
  assert.deepEqual(codex.args.slice(0, 3), ["exec", "--sandbox", "read-only"]);
  assert.throws(() => judgeCommand({ judge: "gpt" }), JUDGE_MUST_BE_RE);
});

test("runJudge sends the prompt on stdin to a custom judge", () => {
  const dir = mkdtempSync(join(tmpdir(), "judge-test-"));
  try {
    const fake = join(dir, "judge.mjs");
    writeFileSync(
      fake,
      `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  const verdict = input.includes("# Rubric: demo") ? "pass" : "fail";
  console.log(JSON.stringify({ verdict, evidence: "saw rubric" }));
});
`
    );
    chmodSync(fake, 0o755);
    const verdict = runJudge({
      judgeCmd: fake,
      prompt: buildJudgePrompt(parseScorer(SCORER), "record"),
    });
    assert.deepEqual(verdict, {
      evidence: "saw rubric",
      suggestion: "",
      verdict: "pass",
    });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("summaries give pass rates per scorer and week", () => {
  const scorer = parseScorer(SCORER);
  const s = session("a", "2026-10-20T09:00:00Z");
  const records = [
    scoreRecord({
      judgeModel: "h",
      scorer,
      session: s,
      verdict: { verdict: "pass" },
    }),
    scoreRecord({
      judgeModel: "h",
      scorer,
      session: s,
      verdict: { verdict: "fail" },
    }),
    scoreRecord({
      judgeModel: "h",
      scorer,
      session: s,
      verdict: { verdict: "n/a" },
    }),
  ];
  const summary = summarizeScores(records);
  assert.deepEqual(summary.demo.weeks, { "2026-W43": { fail: 1, pass: 1 } });
  assert.equal(summary.demo.na, 1);
  assert.match(formatSummary(summary), DEMO_SUMMARY_RE);
});
