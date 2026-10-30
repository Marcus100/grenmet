import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatRecord,
  MARKER,
  parseRecords,
  validateRecord,
  withSession,
} from "./run-record.mjs";

const NO_MATCHING_RE = /no matching/u;

const SUMMARY_LINE =
  /\*\*Agent run:\*\* claude · claude-sonnet-5-5 · success · #366/u;
const INVALID_RUN = /Invalid run record/u;
const KIND_RULE = /kind must be one of/u;
const SCRIPT = fileURLToPath(new URL("./run-record.mjs", import.meta.url));

const RUN = {
  agent: "claude",
  friction: "none",
  kind: "run",
  model: "claude-sonnet-5-5",
  outcome: "success",
  retries: 1,
  task: "#366",
  tier: "standard",
  verify: "pass",
  wall_minutes: 14.5,
};
const REVIEW = { accepted: true, kind: "review", pr: 12, review_minutes: 6 };
const USAGE = { agent: "codex", kind: "usage", percent: 35, week: "2026-W42" };

test("valid records of every kind pass validation", () => {
  for (const record of [
    RUN,
    REVIEW,
    USAGE,
    { ...RUN, benchmark: "bm-01", pr: 9 },
  ])
    assert.deepEqual(validateRecord(record), []);
});

test("invalid values are named, not guessed at", () => {
  const problems = validateRecord({
    ...RUN,
    outcome: "great",
    retries: -1,
    tier: "huge",
    wall_minutes: "fast",
  });
  assert.deepEqual(problems.sort(), [
    "outcome must be one of success, flawed, blocked, manual",
    "retries must be a non-negative integer",
    "tier must be one of low, standard, high",
    "wall_minutes must be a non-negative number",
  ]);
});

test("missing fields, unknown fields and unknown kinds are rejected", () => {
  assert.ok(validateRecord({ kind: "run" }).length >= 9);
  assert.deepEqual(validateRecord({ ...RUN, secret: "x" }), [
    "unknown field secret",
  ]);
  assert.match(validateRecord({ kind: "nope" })[0], KIND_RULE);
  assert.deepEqual(validateRecord(null), ["record must be an object"]);
  assert.ok(validateRecord({ ...USAGE, percent: 120 }).length > 0);
  assert.ok(validateRecord({ ...USAGE, week: "week 42" }).length > 0);
});

test("a record round-trips through its comment format", () => {
  const body = formatRecord(RUN);
  assert.ok(body.startsWith(MARKER));
  assert.match(body, SUMMARY_LINE);
  assert.deepEqual(parseRecords(body), { errors: [], records: [RUN] });
});

test("formatting refuses an invalid record", () => {
  assert.throws(() => formatRecord({ ...RUN, agent: "gpt" }), INVALID_RUN);
});

test("many comments are parsed and bad blocks are reported, not dropped", () => {
  const text = [
    "unrelated comment",
    formatRecord(RUN),
    `${MARKER}\nno block here`,
    `${MARKER}\n\n\`\`\`json\n{not json}\n\`\`\``,
    `${MARKER}\n\n\`\`\`json\n${JSON.stringify({ ...RUN, outcome: "x" })}\n\`\`\``,
    formatRecord(REVIEW),
  ].join("\n---\n");
  const { errors, records } = parseRecords(text);
  assert.equal(records.length, 2);
  assert.equal(errors.length, 3);
  assert.deepEqual(parseRecords("nothing to see"), { errors: [], records: [] });
});

function cli(...args) {
  return spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
}

test("the CLI prints a valid comment body", () => {
  const result = cli(
    "--kind",
    "run",
    "--agent",
    "codex",
    "--model",
    "gpt-6.1-sol",
    "--task",
    "bm-03",
    "--outcome",
    "flawed",
    "--verify",
    "fail",
    "--retries",
    "2",
    "--wall-minutes",
    "31",
    "--tier",
    "low",
    "--benchmark",
    "bm-03",
    "--friction",
    "flaky e2e"
  );
  assert.equal(result.status, 0, result.stderr);
  const { records } = parseRecords(result.stdout);
  assert.equal(records[0].agent, "codex");
  assert.equal(records[0].retries, 2);
  assert.equal(records[0].benchmark, "bm-03");
  assert.equal(records[0].friction, "flaky e2e");
});

test("the CLI defaults friction to none and rejects bad input with exit 2", () => {
  const ok = cli(
    "--agent",
    "claude",
    "--model",
    "m",
    "--task",
    "t",
    "--outcome",
    "success",
    "--verify",
    "pass",
    "--retries",
    "0",
    "--wall-minutes",
    "1",
    "--tier",
    "low"
  );
  assert.equal(parseRecords(ok.stdout).records[0].friction, "none");
  const bad = cli("--agent", "claude");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, INVALID_RUN);
});

test("withSession fills transcript fields and keeps explicit flags", () => {
  const session = {
    agent: "claude",
    id: "abc",
    minutes: 12.5,
    model: "claude-haiku-5-5",
    tokens: { cached: 900, input: 100, output: 50, total: 1050 },
  };
  const record = withSession(
    {
      friction: "none",
      kind: "run",
      model: "claude-sonnet-5-5",
      outcome: "success",
      retries: 0,
      task: "#1",
      tier: "low",
      verify: "pass",
    },
    session
  );
  assert.equal(record.model, "claude-sonnet-5-5");
  assert.equal(record.agent, "claude");
  assert.equal(record.wall_minutes, 12.5);
  assert.equal(record.total_tokens, 1050);
  assert.equal(record.input_tokens, 1000);
  assert.equal(record.session, "abc");
  assert.deepEqual(validateRecord(record), []);
  assert.throws(() => withSession(record, undefined), NO_MATCHING_RE);
});

test("token fields must be counts", () => {
  const problems = validateRecord({
    agent: "codex",
    friction: "none",
    kind: "run",
    model: "m",
    outcome: "success",
    retries: 0,
    task: "t",
    tier: "low",
    total_tokens: -1,
    verify: "pass",
    wall_minutes: 1,
  });
  assert.deepEqual(problems, ["total_tokens must be a non-negative integer"]);
});
