#!/usr/bin/env node
// Weekly CI health report: durations, failure rates, retried-then-passed jobs
// and queue time from GitHub Actions run and job data. Pure summary functions
// plus a CLI that reads the JSON fetched by .github/workflows/ci-health.yml.
// Usage: node scripts/ci/health-report.mjs <runs.json> <jobs.json>
//   runs.json: array of workflow runs (GET /actions/runs)
//   jobs.json: array of jobs from every attempt (GET /runs/{id}/jobs?filter=all)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const seconds = (from, to) => (Date.parse(to) - Date.parse(from)) / 1000;

export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

const minutes = (value) => `${(value / 60).toFixed(1)} min`;
const percent = (part, whole) =>
  whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;

// Matrix jobs share a name pattern; group them by the stable prefix.
const jobKey = (job) => `${job.workflow_name} / ${job.name.split(" (")[0]}`;

export function summarize(runs, jobs) {
  const completed = runs.filter((run) => run.status === "completed");
  const byWorkflow = new Map();
  for (const run of completed) {
    const entry = byWorkflow.get(run.name) ?? {
      durations: [],
      failed: 0,
      cancelled: 0,
      retried: 0,
      total: 0,
    };
    entry.total += 1;
    entry.durations.push(
      seconds(run.run_started_at ?? run.created_at, run.updated_at)
    );
    if (run.conclusion === "failure") entry.failed += 1;
    if (run.conclusion === "cancelled") entry.cancelled += 1;
    if (run.run_attempt > 1 && run.conclusion === "success") entry.retried += 1;
    byWorkflow.set(run.name, entry);
  }

  const finished = jobs.filter(
    (job) => job.status === "completed" && job.started_at && job.completed_at
  );
  const byJob = new Map();
  for (const job of finished) {
    if (job.conclusion === "skipped") continue;
    const key = jobKey(job);
    const entry = byJob.get(key) ?? { durations: [], failed: 0, total: 0 };
    entry.total += 1;
    entry.durations.push(seconds(job.started_at, job.completed_at));
    if (job.conclusion === "failure") entry.failed += 1;
    byJob.set(key, entry);
  }

  // A job that failed in one attempt and passed in a later attempt of the
  // same run is flaky: nothing changed between the attempts.
  const attempts = new Map();
  for (const job of finished) {
    const key = `${job.run_id}\0${job.name}`;
    const entry = attempts.get(key) ?? { job, results: [] };
    entry.results.push([job.run_attempt ?? 1, job.conclusion]);
    attempts.set(key, entry);
  }
  const flaky = new Map();
  for (const { job, results } of attempts.values()) {
    results.sort((a, b) => a[0] - b[0]);
    const failedFirst = results.findIndex(([, result]) => result === "failure");
    const passedLater =
      failedFirst >= 0 &&
      results.slice(failedFirst + 1).some(([, result]) => result === "success");
    if (passedLater) flaky.set(jobKey(job), (flaky.get(jobKey(job)) ?? 0) + 1);
  }

  const queue = jobs
    .filter((job) => job.started_at && job.created_at)
    .map((job) => Math.max(0, seconds(job.created_at, job.started_at)));

  return { byWorkflow, byJob, flaky, queue, runs: completed.length };
}

export function renderReport(summary, { from, to }) {
  const lines = [
    `CI health for ${from} to ${to}: ${summary.runs} completed runs.`,
    "",
    "Generated weekly by `.github/workflows/ci-health.yml` (`scripts/ci/health-report.mjs`). Durations are wall time; a retried run counts once.",
    "",
    "## Workflows",
    "",
    "| Workflow | Runs | p50 | p90 | Failed | Cancelled | Passed on retry |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const workflows = [...summary.byWorkflow.entries()].sort(
    (a, b) => percentile(b[1].durations, 90) - percentile(a[1].durations, 90)
  );
  for (const [name, entry] of workflows)
    lines.push(
      `| ${name} | ${entry.total} | ${minutes(percentile(entry.durations, 50))} | ${minutes(percentile(entry.durations, 90))} | ${percent(entry.failed, entry.total)} | ${percent(entry.cancelled, entry.total)} | ${entry.retried} |`
    );

  lines.push(
    "",
    "## Slowest jobs (p90)",
    "",
    "| Job | Runs | p50 | p90 | Failure rate |",
    "| --- | --- | --- | --- | --- |"
  );
  const slowest = [...summary.byJob.entries()]
    .sort(
      (a, b) => percentile(b[1].durations, 90) - percentile(a[1].durations, 90)
    )
    .slice(0, 10);
  for (const [name, entry] of slowest)
    lines.push(
      `| ${name} | ${entry.total} | ${minutes(percentile(entry.durations, 50))} | ${minutes(percentile(entry.durations, 90))} | ${percent(entry.failed, entry.total)} |`
    );

  lines.push("", "## Flaky jobs (failed, then passed on a re-run)", "");
  const flaky = [...summary.flaky.entries()].sort((a, b) => b[1] - a[1]);
  if (flaky.length === 0) lines.push("None this week.");
  for (const [name, count] of flaky) lines.push(`- ${name}: ${count}`);

  lines.push(
    "",
    "## Queue time (job created to started)",
    "",
    `p50 ${minutes(percentile(summary.queue, 50))}, p90 ${minutes(percentile(summary.queue, 90))}.`
  );
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [runsPath, jobsPath] = process.argv.slice(2);
  const runs = JSON.parse(readFileSync(runsPath, "utf8"));
  const jobs = JSON.parse(readFileSync(jobsPath, "utf8"));
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  process.stdout.write(renderReport(summarize(runs, jobs), { from, to }));
}
