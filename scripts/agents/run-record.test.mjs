import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatRecord,
  MARKER,
  parseRecords,
  validateRecord,
} from "./run-record.mjs";

const SUMMARY_LINE =
  /\*\*Agent run:\*\* claude · claude-sonnet-5-5 · success · #366/;
const INVALID_RUN = /Invalid run record/;
const KIND_RULE = /kind must be one of/;
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
