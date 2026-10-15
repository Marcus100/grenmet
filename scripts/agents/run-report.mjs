#!/usr/bin/env node
// Turns run records into the numbers that decide routing and autonomy: how often
// agent PRs are accepted, how often checks pass first time, how much review time
// they cost, and how much of each plan's allowance the factory uses.
//
// Usage: node scripts/agents/run-report.mjs [--file records.json]
//          [--only live|benchmark]      (default: all records)
// With no --file it reads comments from GitHub through `gh`.
// A file holds { "records": [...], "prs": [{ "number": 1, "state": "MERGED" }] }.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRecords } from "./run-record.mjs";

const GH_LIMIT = "500";
const PERCENT = 100;
const DECIMALS = 1;

const ratio = (part, whole) => (whole === 0 ? null : part / whole);
const mean = (values) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

// A PR is accepted when a human review says so, otherwise when it merged. It is
// rejected on a "not accepted" review or when closed unmerged; anything else is
// still open and excluded from rates.
function prVerdicts(records, prs) {
  const reviews = new Map(
    records.filter((r) => r.kind === "review").map((r) => [r.pr, r])
  );
  const verdicts = new Map();
  for (const [number, pr] of prs) {
    const review = reviews.get(number);
    if (review) verdicts.set(number, review.accepted ? "accepted" : "rejected");
    else if (pr.state === "MERGED") verdicts.set(number, "accepted");
    else if (pr.state === "CLOSED") verdicts.set(number, "rejected");
    else verdicts.set(number, "open");
  }
  return { reviews, verdicts };
}

function summarize(runs, verdicts) {
  const prNumbers = [
    ...new Set(runs.map((r) => r.pr).filter((n) => n !== undefined)),
  ];
  const decided = prNumbers
    .map((n) => verdicts.get(n))
    .filter((v) => v === "accepted" || v === "rejected");
  return {
    acceptedPrRate: ratio(
      decided.filter((v) => v === "accepted").length,
      decided.length
    ),
    firstPassRate: ratio(
      runs.filter((r) => r.verify === "pass" && r.retries === 0).length,
      runs.length
    ),
    meanRetries: mean(runs.map((r) => r.retries)),
    meanWallMinutes: mean(runs.map((r) => r.wall_minutes)),
    prsDecided: decided.length,
    runs: runs.length,
    successRate: ratio(
      runs.filter((r) => r.outcome === "success").length,
      runs.length
    ),
  };
}

function groupBy(runs, key, verdicts) {
  const groups = new Map();
  for (const run of runs) {
    const name = run[key];
    groups.set(name, [...(groups.get(name) ?? []), run]);
  }
  return Object.fromEntries(
    [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => [name, summarize(list, verdicts)])
  );
}

function usageByAgent(records) {
  const usage = {};
  for (const record of records.filter((r) => r.kind === "usage")) {
    usage[record.agent] ??= [];
    usage[record.agent].push({ percent: record.percent, week: record.week });
  }
  return Object.fromEntries(
    Object.entries(usage).map(([agent, weeks]) => [
      agent,
      {
        latest: weeks.sort((a, b) => a.week.localeCompare(b.week)).at(-1),
        meanPercent: mean(weeks.map((w) => w.percent)),
      },
    ])
  );
}

// `prs` is a Map of PR number -> { state: "MERGED" | "CLOSED" | "OPEN" }.
export function computeReport(records, prs = new Map(), { only } = {}) {
  const runs = records.filter(
    (r) =>
      r.kind === "run" &&
      (only === undefined ||
        (only === "benchmark"
          ? r.benchmark !== undefined
          : r.benchmark === undefined))
  );
  const { reviews, verdicts } = prVerdicts(records, prs);
  const reviewMinutes = [...reviews.values()].map((r) => r.review_minutes);
  return {
    byAgent: groupBy(runs, "agent", verdicts),
    byModel: groupBy(runs, "model", verdicts),
    byTier: groupBy(runs, "tier", verdicts),
    outcomes: Object.fromEntries(
      ["success", "flawed", "blocked", "manual"].map((o) => [
        o,
        runs.filter((r) => r.outcome === o).length,
      ])
    ),
    overall: summarize(runs, verdicts),
    review: {
      meanMinutes: mean(reviewMinutes),
      reviews: reviewMinutes.length,
      totalMinutes: reviewMinutes.reduce((sum, minutes) => sum + minutes, 0),
    },
    usage: usageByAgent(records),
  };
}

const pct = (value) =>
  value === null ? "n/a" : `${(value * PERCENT).toFixed(0)}%`;
const num = (value) => (value === null ? "n/a" : value.toFixed(DECIMALS));

function groupTable(title, groups) {
  const rows = Object.entries(groups).map(
    ([name, s]) =>
      `  ${name.padEnd(22)} runs ${String(s.runs).padStart(3)}  success ${pct(s.successRate).padStart(4)}  first-pass ${pct(s.firstPassRate).padStart(4)}  accepted-PR ${pct(s.acceptedPrRate).padStart(4)} (${s.prsDecided})  retries ${num(s.meanRetries)}  min ${num(s.meanWallMinutes)}`
  );
  return rows.length === 0 ? [] : ["", `${title}:`, ...rows];
}

export function formatReport(report) {
  const { overall, outcomes, review, usage } = report;
  const lines = [
    `Runs: ${overall.runs}   success ${pct(overall.successRate)}   first-pass ${pct(overall.firstPassRate)}   accepted-PR ${pct(overall.acceptedPrRate)} (${overall.prsDecided} decided)`,
    `Outcomes: ${Object.entries(outcomes)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
    `Mean retries ${num(overall.meanRetries)}, mean wall time ${num(overall.meanWallMinutes)} min`,
    `Review: ${review.reviews} reviews, ${num(review.meanMinutes)} min mean, ${review.totalMinutes} min total`,
    ...groupTable("By agent", report.byAgent),
    ...groupTable("By model", report.byModel),
    ...groupTable("By risk tier", report.byTier),
  ];
  const usageLines = Object.entries(usage).map(
    ([agent, u]) =>
      `  ${agent.padEnd(8)} latest ${u.latest.week} ${u.latest.percent}%, mean ${num(u.meanPercent)}%`
  );
  if (usageLines.length > 0) lines.push("", "Plan usage:", ...usageLines);
  return lines.join("\n");
}

function gh(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`gh ${args[0]} failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function loadFromGitHub() {
  const issues = gh([
    "issue",
    "list",
    "--state",
    "all",
    "--limit",
    GH_LIMIT,
    "--json",
    "number,comments",
  ]);
  const pulls = gh([
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    GH_LIMIT,
    "--json",
    "number,state,comments",
  ]);
  const text = [...issues, ...pulls]
    .flatMap((item) => item.comments.map((c) => c.body))
    .join("\n");
  return {
    ...parseRecords(text),
    prs: new Map(pulls.map((p) => [p.number, { state: p.state }])),
  };
}

function loadFromFile(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  return {
    errors: [],
    prs: new Map((data.prs ?? []).map((p) => [p.number, { state: p.state }])),
    records: data.records ?? [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const option = (name) => args[args.indexOf(name) + 1];
    const only = args.includes("--only") ? option("--only") : undefined;
    if (only !== undefined && !["live", "benchmark"].includes(only))
      throw new Error("--only must be live or benchmark");
    const { errors, prs, records } = args.includes("--file")
      ? loadFromFile(option("--file"))
      : loadFromGitHub();
    console.log(formatReport(computeReport(records, prs, { only })));
    if (errors.length > 0)
      console.error(
        `\n${errors.length} record(s) could not be parsed: ${errors.slice(0, 3).join(" | ")}`
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
