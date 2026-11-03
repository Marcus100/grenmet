import assert from "node:assert/strict";
import test from "node:test";
import { percentile, renderReport, summarize } from "./health-report.mjs";

const HEADER = /CI health for 2026-10-27 to 2026-11-03: 1 completed runs/u;
const WORKFLOW_ROW =
  /\| CI \| 1 \| 10\.0 min \| 10\.0 min \| 0% \| 0% \| 0 \|/u;
const JOB_ROW = /\| CI \/ Type Check \| 1 \| 2\.0 min/u;
const NO_FLAKY = /None this week\./u;
const QUEUE = /p50 1\.0 min/u;

const at = (minute) =>
  new Date(Date.UTC(2026, 10, 3, 12, minute)).toISOString();
const run = (name, start, end, conclusion = "success", attempt = 1) => ({
  name,
  status: "completed",
  conclusion,
  run_attempt: attempt,
  run_started_at: at(start),
  created_at: at(start),
  updated_at: at(end),
});
const job = (runId, name, start, end, conclusion, attempt = 1) => ({
  run_id: runId,
  workflow_name: "CI",
  name,
  status: "completed",
  conclusion,
  run_attempt: attempt,
  created_at: at(start),
  started_at: at(start + 1),
  completed_at: at(end),
});

test("percentile uses the nearest rank and tolerates no data", () => {
  assert.equal(percentile([], 90), 0);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
});

test("workflow rates count failures, cancellations and retried passes", () => {
  const summary = summarize(
    [
      run("CI", 0, 10),
      run("CI", 0, 4, "failure"),
      run("CI", 0, 2, "cancelled"),
      run("CI", 0, 8, "success", 2),
      { name: "CI", status: "in_progress" },
    ],
    []
  );
  const ci = summary.byWorkflow.get("CI");
  assert.equal(summary.runs, 4);
  assert.deepEqual(
    {
      total: ci.total,
      failed: ci.failed,
      cancelled: ci.cancelled,
      retried: ci.retried,
    },
    { total: 4, failed: 1, cancelled: 1, retried: 1 }
  );
});

test("a job that fails then passes in a later attempt is flaky", () => {
  const summary = summarize(
    [],
    [
      job(1, "API Tests (shard 1)", 0, 5, "failure", 1),
      job(1, "API Tests (shard 1)", 10, 15, "success", 2),
      job(2, "API Tests (shard 2)", 0, 5, "failure", 1),
      job(3, "Type Check", 0, 3, "success", 1),
      job(3, "Lint", 0, 0, "skipped", 1),
    ]
  );
  assert.deepEqual([...summary.flaky.entries()], [["CI / API Tests", 1]]);
  // Matrix entries share one row; skipped jobs are left out.
  assert.equal(summary.byJob.get("CI / API Tests").total, 3);
  assert.equal(summary.byJob.has("CI / Lint"), false);
  assert.equal(summary.queue.length, 5);
});

test("report lists workflows, slowest jobs, flaky jobs and queue time", () => {
  const report = renderReport(
    summarize([run("CI", 0, 10)], [job(1, "Type Check", 0, 3, "success")]),
    { from: "2026-10-27", to: "2026-11-03" }
  );
  assert.match(report, HEADER);
  assert.match(report, WORKFLOW_ROW);
  assert.match(report, JOB_ROW);
  assert.match(report, NO_FLAKY);
  assert.match(report, QUEUE);
});
