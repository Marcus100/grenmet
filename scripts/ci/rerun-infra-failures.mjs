#!/usr/bin/env node
// Re-runs a failed workflow run once when at least one failed job failed for a
// reason that is not about the code: a container registry rate limit or outage,
// a network timeout, or a lost runner. A run whose failures are all real (a
// test, lint or build error) is left alone and stays red. Gate jobs such as
// "CI Success" fail only because other jobs failed, so they are not judged on
// their own; the single re-run is the cap if a real failure shares a run with
// an infrastructure one (the real failure simply fails again).
//
// Usage: node scripts/ci/rerun-infra-failures.mjs <run-id> [--dry-run]
// Needs GH_TOKEN (actions: write) and GH_REPO (owner/name); optional
// RERUN_DELAY_SECONDS waits before the re-run. Used by
// .github/workflows/auto-rerun.yml and runnable by hand.
//
// Log text is untrusted data: it is only matched against fixed patterns and
// never run, interpolated into a shell command or written anywhere.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** One automatic re-run: attempt 1 fails, attempt 2 is the retry. */
export const MAX_ATTEMPTS = 2;
const MAX_JOBS_READ = 60;

/** Fixed patterns of failures that a re-run can fix. Keep them specific. */
export const TRANSIENT_PATTERNS = [
  /toomanyrequests/iu,
  /429 Too Many Requests/iu,
  /You have reached your (unauthenticated )?pull rate limit/iu,
  /unexpected status from (HEAD|GET) request to https:\/\/(registry-1\.docker\.io|ghcr\.io|registry\.npmjs\.org)[^\n]* (429|500|502|503|504)\b/iu,
  /Docker pull failed with exit code/iu,
  /TLS handshake timeout/iu,
  /net\/http: request canceled/iu,
  /i\/o timeout/iu,
  /connection reset by peer/iu,
  /Temporary failure in name resolution/iu,
  /ECONNRESET|ETIMEDOUT|EAI_AGAIN/u,
  /The hosted runner lost communication with the server/iu,
  /The runner has received a shutdown signal/iu,
  /Received request to deprovision: The request was cancelled/iu,
  /RPC failed; HTTP (500|502|503|504)/iu,
];

/** True when the log shows a transient infrastructure failure. */
export function isTransientFailure(log) {
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(log));
}

/**
 * Decides what to do with a finished run. `jobs` are the failed jobs with a
 * `log` string each. Pure so it can be tested without GitHub.
 */
export function decide({ run, jobs }) {
  if (run.conclusion !== "failure") {
    return { rerun: false, reason: `conclusion is ${run.conclusion}` };
  }
  if (run.run_attempt >= MAX_ATTEMPTS) {
    return { rerun: false, reason: `already attempt ${run.run_attempt}` };
  }
  if (jobs.length === 0) {
    return { rerun: false, reason: "no failed jobs found" };
  }
  const transient = jobs.filter((job) => isTransientFailure(job.log));
  if (transient.length === 0) {
    return {
      rerun: false,
      reason: "no failed job hit an infrastructure error",
    };
  }
  return {
    rerun: true,
    reason: `${transient.length} of ${jobs.length} failed job(s) hit an infrastructure error: ${transient
      .slice(0, 3)
      .map((job) => job.name)
      .join(", ")}`,
  };
}

function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function failedJobs(repo, runId) {
  const jobs = gh([
    "api",
    "--paginate",
    `repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
    "--jq",
    '.jobs[] | select(.conclusion == "failure") | {id, name}',
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return jobs.slice(0, MAX_JOBS_READ).map((job) => {
    let log = "";
    try {
      log = gh(["api", `repos/${repo}/actions/jobs/${job.id}/logs`]);
    } catch {
      // A job whose log cannot be read is treated as a real failure.
    }
    return { ...job, log };
  });
}

const RUN_ID = /^\d+$/u;

async function main() {
  const [runId, ...flags] = process.argv.slice(2);
  const repo = process.env.GH_REPO;
  if (!(runId && RUN_ID.test(runId) && repo)) {
    console.error(
      "usage: GH_REPO=owner/name rerun-infra-failures.mjs <run-id> [--dry-run]"
    );
    process.exit(2);
  }
  const run = JSON.parse(gh(["api", `repos/${repo}/actions/runs/${runId}`]));
  if (run.head_repository?.full_name !== repo) {
    console.log("Run is from a fork; not re-running.");
    return;
  }
  const verdict = decide({
    run,
    jobs: run.conclusion === "failure" ? failedJobs(repo, runId) : [],
  });
  console.log(`${run.name} #${runId}: ${verdict.reason}`);
  if (!verdict.rerun) return;
  if (flags.includes("--dry-run")) {
    console.log("Dry run: would re-run the failed jobs.");
    return;
  }
  // Give a rate-limit window time to ease before trying again.
  const delay = Number(process.env.RERUN_DELAY_SECONDS ?? 0);
  if (delay > 0) await new Promise((done) => setTimeout(done, delay * 1000));
  gh([
    "api",
    "-X",
    "POST",
    `repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
  ]);
  console.log("Re-ran the failed jobs.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
