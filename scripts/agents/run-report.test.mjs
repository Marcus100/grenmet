import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { computeReport, formatReport } from "./run-report.mjs";

const SCRIPT = fileURLToPath(new URL("./run-report.mjs", import.meta.url));
const RUNS_LINE = /Runs: 5 /u;
const NA_RATE = /accepted-PR n\/a/u;
const SUCCESS_60 = /success 60%/u;
const ACCEPTED_50 = /accepted-PR 50% \(2 decided\)/u;
const BY_AGENT = /By agent:/u;
const CLAUDE_USAGE = /claude {2,}latest 2026-W42 40%/u;

const run = (fields) => ({
  agent: "claude",
  friction: "none",
  kind: "run",
  model: "claude-sonnet-5-5",
  outcome: "success",
  retries: 0,
  task: "t",
  tier: "low",
  verify: "pass",
  wall_minutes: 10,
  ...fields,
});

// Five runs: two Claude (PRs 1 and 2), two Codex live (PR 3 open, one without a
// PR) and one Codex benchmark run.
const RECORDS = [
  run({ pr: 1 }),
  run({
    outcome: "flawed",
    pr: 2,
    retries: 2,
    tier: "standard",
    verify: "fail",
    wall_minutes: 30,
  }),
  run({
    agent: "codex",
    model: "gpt-6.1-sol",
    pr: 3,
    retries: 1,
    tier: "standard",
    wall_minutes: 20,
  }),
  run({
    agent: "codex",
    model: "gpt-6.1-sol",
    outcome: "blocked",
    tier: "high",
    verify: "skipped",
    wall_minutes: 5,
  }),
  run({
    agent: "codex",
    benchmark: "bm-1",
    model: "gpt-6-luna",
    wall_minutes: 8,
  }),
  { accepted: true, kind: "review", pr: 1, review_minutes: 6 },
  { accepted: false, kind: "review", pr: 2, review_minutes: 4 },
  { agent: "claude", kind: "usage", percent: 20, week: "2026-W41" },
  { agent: "claude", kind: "usage", percent: 40, week: "2026-W42" },
  { agent: "codex", kind: "usage", percent: 10, week: "2026-W42" },
];
const PRS = new Map([
  [1, { state: "MERGED" }],
  [2, { state: "CLOSED" }],
  [3, { state: "OPEN" }],
]);

test("overall rates match the hand-computed values", () => {
  const { outcomes, overall } = computeReport(RECORDS, PRS);
  assert.equal(overall.runs, 5);
  assert.equal(overall.successRate, 3 / 5);
  assert.equal(overall.firstPassRate, 2 / 5);
  assert.equal(overall.meanRetries, 0.6);
  assert.equal(overall.meanWallMinutes, 14.6);
  // PR 1 accepted, PR 2 rejected, PR 3 still open and excluded.
  assert.equal(overall.prsDecided, 2);
  assert.equal(overall.acceptedPrRate, 0.5);
  assert.deepEqual(outcomes, { blocked: 1, flawed: 1, manual: 0, success: 3 });
});

test("review time and plan usage are aggregated", () => {
  const { review, usage } = computeReport(RECORDS, PRS);
  assert.deepEqual(review, { meanMinutes: 5, reviews: 2, totalMinutes: 10 });
  assert.deepEqual(usage.claude, {
    latest: { percent: 40, week: "2026-W42" },
    meanPercent: 30,
  });
  assert.equal(usage.codex.latest.percent, 10);
});

test("rates are split by agent, model and tier", () => {
  const { byAgent, byModel, byTier } = computeReport(RECORDS, PRS);
  assert.equal(byAgent.claude.runs, 2);
  assert.equal(byAgent.claude.acceptedPrRate, 0.5);
  assert.equal(byAgent.codex.runs, 3);
  assert.equal(byAgent.codex.acceptedPrRate, null);
  assert.deepEqual(Object.keys(byModel), [
    "claude-sonnet-5-5",
    "gpt-6-luna",
    "gpt-6.1-sol",
  ]);
  assert.equal(byTier.high.runs, 1);
  assert.equal(byTier.standard.firstPassRate, 0);
});

test("--only separates live runs from benchmark runs", () => {
  assert.equal(computeReport(RECORDS, PRS, { only: "live" }).overall.runs, 4);
  const benchmark = computeReport(RECORDS, PRS, { only: "benchmark" });
  assert.equal(benchmark.overall.runs, 1);
  assert.equal(benchmark.byAgent.codex.runs, 1);
});

test("a review overrides the PR state, and a merged PR without a review counts as accepted", () => {
  const records = [
    run({ pr: 1 }),
    { accepted: false, kind: "review", pr: 1, review_minutes: 3 },
    run({ pr: 2 }),
  ];
  const prs = new Map([
    [1, { state: "MERGED" }],
    [2, { state: "MERGED" }],
  ]);
  const { overall } = computeReport(records, prs);
  assert.equal(overall.prsDecided, 2);
  assert.equal(overall.acceptedPrRate, 0.5);
});

test("empty input reports n/a instead of dividing by zero", () => {
  const report = computeReport([]);
  assert.equal(report.overall.runs, 0);
  assert.equal(report.overall.successRate, null);
  assert.match(formatReport(report), NA_RATE);
});

test("the formatted report is readable", () => {
  const text = formatReport(computeReport(RECORDS, PRS));
  assert.match(text, RUNS_LINE);
  assert.match(text, SUCCESS_60);
  assert.match(text, ACCEPTED_50);
  assert.match(text, BY_AGENT);
  assert.match(text, CLAUDE_USAGE);
});

test("the CLI reads a records file and rejects a bad --only", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "run-report-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const file = join(dir, "records.json");
  writeFileSync(
    file,
    JSON.stringify({
      prs: [...PRS].map(([number, pr]) => ({ number, ...pr })),
      records: RECORDS,
    })
  );
  const ok = spawnSync("node", [SCRIPT, "--file", file], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, RUNS_LINE);
  const bad = spawnSync("node", [SCRIPT, "--file", file, "--only", "nope"], {
    encoding: "utf8",
  });
  assert.equal(bad.status, 2);
});
