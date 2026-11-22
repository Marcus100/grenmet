import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  checkRuns,
  findWrongSkips,
  parseRecords,
  report,
} from "./selection-report.mjs";

const record = (headSha, wouldSkip, pr = 1) =>
  JSON.stringify({ pr, headSha, baseRef: "dev", rollout: "shadow", wouldSkip });

test("a failed check in a skipped group is a wrong skip", () => {
  const records = parseRecords([
    record("a1", ["api", "codeql:python"], 11),
    record("b2", ["journeys"], 12),
  ]);
  const wrong = findWrongSkips(records, {
    a1: [
      { name: "API Tests (shard 2/3)", conclusion: "failure" },
      { name: "API Tests (shard 1/3)", conclusion: "success" },
      { name: "Analyze (javascript-typescript)", conclusion: "failure" },
      { name: "TypeScript Tests", conclusion: "failure" },
    ],
    b2: [{ name: "Browser journeys", conclusion: "success" }],
  });
  assert.deepEqual(
    wrong.map(({ pr, check, group }) => [pr, check, group]),
    [[11, "API Tests (shard 2/3)", "api"]]
  );
});

test("timeouts count, cancellations and unknown heads do not", () => {
  const records = parseRecords([record("c3", ["storage"]), record("d4", ["api"])]);
  const wrong = findWrongSkips(records, {
    c3: [{ name: "Core storage integration", conclusion: "timed_out" }],
    d4: [{ name: "API Tests (fuzz)", conclusion: "cancelled" }],
    e5: [{ name: "API Tests (fuzz)", conclusion: "failure" }],
  });
  assert.deepEqual(wrong.map((item) => item.check), ["Core storage integration"]);
});

test("records for other branches or damaged files are ignored; the latest per head wins", () => {
  const records = parseRecords([
    "not json",
    JSON.stringify({ headSha: "x", baseRef: "staging", wouldSkip: ["api"] }),
    record("f6", ["api"]),
    record("f6", ["journeys"], 2),
  ]);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].wouldSkip, ["journeys"]);
});

test("report downloads records, reads check conclusions and lists wrong skips", () => {
  const gh = (args) => {
    if (args[0] === "run" && args[1] === "list")
      return JSON.stringify([{ databaseId: 5 }, { databaseId: 6 }]);
    if (args[0] === "run" && args[1] === "download") {
      if (args[2] === "6") throw new Error("artifact expired");
      const dir = args[args.indexOf("--dir") + 1];
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "ci-selection.json"), record("a1", ["api"], 42));
      return "";
    }
    assert.match(args[2], /commits\/a1\/check-runs/u);
    return "API Tests (fuzz)\tfailure\nCode Quality\tsuccess\n";
  };
  assert.deepEqual(checkRuns("a1", "o/r", gh), [
    { name: "API Tests (fuzz)", conclusion: "failure" },
    { name: "Code Quality", conclusion: "success" },
  ]);
  const result = report({ repository: "o/r", limit: 2, gh });
  assert.equal(result.records.length, 1);
  assert.deepEqual(
    result.wrong.map(({ pr, check }) => [pr, check]),
    [[42, "API Tests (fuzz)"]]
  );
});
