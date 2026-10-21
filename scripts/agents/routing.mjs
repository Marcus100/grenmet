#!/usr/bin/env node
// Turns benchmark results into the model each issue area is routed to.
//
//   report [--results <file>]   table of runs per agent, model and area; * marks
//                               rows on the Pareto frontier of their area
//   write  [--results <file>]   write docs/agents/routing.json from the results
//   route <label...>            print the runner for issue labels, e.g. area:web risk:low
//
// Results default to ~/.cache/grenmet-bench/results.json (from benchmark.mjs run).
// Routines read docs/agents/routing.json, the checked-in source of truth.
//
// A route is measured only when an area has at least MIN_RUNS runs of a row. Until
// then the owner's preference stands and the evidence says so. A task's area comes
// from task.area, or from its hidden_tests when every test file sits in one area;
// otherwise the run counts as "all", so mixed tasks never reach a single area.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROUTING_FILE = join(repoRoot, "docs/agents/routing.json");
const TASKS_FILE = join(repoRoot, "docs/agents/benchmarks/tasks.json");
const DEFAULT_RESULTS = join(
  homedir(),
  ".cache",
  "grenmet-bench",
  "results.json"
);
const EXIT_ERROR = 2;

export const MIN_RUNS = 3;
// A route may give up this much pass rate (5 points) to be cheaper.
export const MARGIN = 0.05;
const EPSILON = 1e-9;
const PERCENT = 100;
export const ROUTED_AREAS = ["web", "api", "docs"];
export const HUMAN_ONLY = ["ci", "infra", "security"];
const AREAS = [...ROUTED_AREAS, "all"];

// The owner's stated preference, used whenever the benchmark has not measured an area.
export const PREFERENCES = {
  web: { agent: "claude", model: "claude-haiku-5-5" },
  api: { agent: "codex", model: "gpt-6-luna" },
  // Docs are "either, cheapest first"; Haiku is the cheap Claude tier.
  docs: { agent: "claude", model: "claude-haiku-5-5" },
};

const AREA_PATHS = [
  ["web", /^(?:apps\/web|packages)\//],
  ["api", /^apps\/api\//],
  ["docs", /^docs\//],
];

// The area a benchmark task belongs to. Offline there is no solution diff, so the
// task's hidden test files stand in for it. A task with no tests, or tests in
// more than one area, is "all".
export function taskArea(task) {
  if (AREAS.includes(task?.area)) return task.area;
  const paths = task?.hidden_tests ?? [];
  if (paths.length === 0) return "all";
  for (const [area, pattern] of AREA_PATHS)
    if (paths.every((path) => pattern.test(path))) return area;
  return "all";
}

const mean = (values) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

// One row per (agent, model, area) over the recorded runs. records[i] and
// runs[i] describe the same run; the model comes from the record, falling back to
// the log's model. Cost is the API-equivalent figure the CLI reported, when it did.
export function summarizeBenchmarks(results, tasks = []) {
  const areaOf = new Map(tasks.map((task) => [task.id, taskArea(task)]));
  const groups = new Map();
  (results.records ?? []).forEach((record, index) => {
    const details = results.runs?.[index]?.details ?? {};
    const area = areaOf.get(record.task ?? record.benchmark) ?? "all";
    const model = record.model ?? details.model ?? "default";
    const key = JSON.stringify([record.agent, model, area]);
    if (!groups.has(key))
      groups.set(key, {
        agent: record.agent,
        area,
        costs: [],
        firstPasses: 0,
        minutes: [],
        model,
        outputs: [],
        passes: 0,
        runs: 0,
        totals: [],
      });
    const group = groups.get(key);
    group.runs += 1;
    if (record.verify === "pass") group.passes += 1;
    if (record.verify === "pass" && record.retries === 0)
      group.firstPasses += 1;
    group.outputs.push(details.outputTokens ?? 0);
    group.totals.push(
      (details.totalInputTokens ?? 0) + (details.outputTokens ?? 0)
    );
    if (details.reportedCostUsd !== undefined)
      group.costs.push(details.reportedCostUsd);
    group.minutes.push(record.wall_minutes ?? 0);
  });
  return [...groups.values()]
    .map((group) => ({
      agent: group.agent,
      area: group.area,
      firstPassRate: group.firstPasses / group.runs,
      meanCostUsd: mean(group.costs),
      meanMinutes: mean(group.minutes),
      meanOutputTokens: mean(group.outputs),
      meanTotalTokens: mean(group.totals),
      model: group.model,
      passRate: group.passes / group.runs,
      runs: group.runs,
    }))
    .sort((a, b) =>
      [a.area, a.agent, a.model]
        .join("\0")
        .localeCompare([b.area, b.agent, b.model].join("\0"))
    );
}

// Rows no other row beats: at least as much pass rate for no more tokens, and
// strictly better on one of the two. Ties are all kept.
export function paretoFrontier(rows) {
  return rows.filter(
    (row) =>
      !rows.some(
        (other) =>
          other !== row &&
          other.passRate >= row.passRate &&
          other.meanTotalTokens <= row.meanTotalTokens &&
          (other.passRate > row.passRate ||
            other.meanTotalTokens < row.meanTotalTokens)
      )
  );
}

const percent = (rate) => `${Math.round(rate * PERCENT)}%`;

export function formatTokens(count) {
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${Math.round(count / 1e3)}k`;
  return `${Math.round(count)}`;
}

// Per routed area: the cheapest frontier row whose pass rate is within MARGIN of the
// best. Only rows with at least minRuns runs count. An area without such a row
// keeps its preference and says it was not measured.
export function chooseRoute(
  rows,
  { minRuns = MIN_RUNS, preferences = PREFERENCES } = {}
) {
  const routes = {};
  for (const [area, preferred] of Object.entries(preferences)) {
    const inArea = rows.filter((row) => row.area === area);
    const eligible = inArea.filter((row) => row.runs >= minRuns);
    if (eligible.length === 0) {
      const runs = inArea.reduce((sum, row) => sum + row.runs, 0);
      routes[area] = {
        agent: preferred.agent,
        evidence: `not measured: ${runs} ${area} runs, ${minRuns} needed for one row; owner preference kept`,
        measured: false,
        model: preferred.model,
      };
      continue;
    }
    const best = Math.max(...eligible.map((row) => row.passRate));
    const candidates = paretoFrontier(eligible).filter(
      (row) => row.passRate >= best - MARGIN - EPSILON
    );
    const pick = candidates.reduce((cheapest, row) =>
      row.meanTotalTokens < cheapest.meanTotalTokens ? row : cheapest
    );
    const agrees =
      pick.agent === preferred.agent && pick.model === preferred.model;
    const verdict = agrees
      ? "agrees with the owner preference"
      : `differs from the owner preference (${preferred.agent}/${preferred.model})`;
    routes[area] = {
      agent: pick.agent,
      evidence: `${pick.runs} runs, pass ${percent(pick.passRate)}, tokens ${formatTokens(pick.meanTotalTokens)}; ${verdict}`,
      measured: true,
      model: pick.model,
    };
  }
  return routes;
}

// The runner for a set of issue labels, or { human: true } when a person must do it.
export function routeFor(labels, routing) {
  if (labels.includes("risk:high"))
    return { human: true, reason: "risk:high needs a human" };
  const areas = labels
    .filter((label) => label.startsWith("area:"))
    .map((label) => label.slice("area:".length));
  if (areas.length !== 1)
    return {
      human: true,
      reason:
        areas.length === 0 ? "no area: label" : "more than one area: label",
    };
  const [area] = areas;
  const humanOnly = routing.human_only ?? HUMAN_ONLY;
  if (humanOnly.includes(area))
    return { human: true, reason: `area:${area} is human only` };
  const route = routing.areas?.[area];
  if (!route) return { human: true, reason: `no route for area:${area}` };
  return { agent: route.agent, measured: route.measured, model: route.model };
}

export function buildRouting(rows, generated, runCount) {
  return {
    version: 1,
    generated,
    source: `benchmark results, ${runCount} runs`,
    areas: chooseRoute(rows),
    human_only: HUMAN_ONLY,
  };
}

export function formatReport(rows) {
  const frontier = new Set();
  for (const area of new Set(rows.map((row) => row.area)))
    for (const row of paretoFrontier(rows.filter((r) => r.area === area)))
      frontier.add(row);
  const header = [
    "",
    "area",
    "agent",
    "model",
    "runs",
    "pass",
    "first-pass",
    "out tok",
    "total tok",
    "API $",
    "min",
  ];
  const body = rows.map((row) => [
    frontier.has(row) ? "*" : "",
    row.area,
    row.agent,
    row.model,
    String(row.runs),
    percent(row.passRate),
    percent(row.firstPassRate),
    formatTokens(row.meanOutputTokens),
    formatTokens(row.meanTotalTokens),
    row.meanCostUsd === null ? "-" : `$${row.meanCostUsd.toFixed(2)}`,
    row.meanMinutes.toFixed(1),
  ]);
  const table = [header, ...body];
  const widths = header.map((_, column) =>
    Math.max(...table.map((cells) => cells[column].length))
  );
  return table
    .map((cells) =>
      cells
        .map((cell, column) => cell.padEnd(widths[column]))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

function readResults(file) {
  if (!existsSync(file)) throw new Error(`No benchmark results at ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function readTasks() {
  return JSON.parse(readFileSync(TASKS_FILE, "utf8")).tasks;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, labels: [], results: DEFAULT_RESULTS };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--results") options.results = rest[++i];
    else if (options.command === "route") options.labels.push(rest[i]);
    else throw new Error(`Unknown argument: ${rest[i]}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "route") {
    const routing = JSON.parse(readFileSync(ROUTING_FILE, "utf8"));
    console.log(JSON.stringify(routeFor(options.labels, routing), null, 2));
    return;
  }
  if (options.command === "report" || options.command === "write") {
    const results = readResults(options.results);
    const rows = summarizeBenchmarks(results, readTasks());
    if (options.command === "report") {
      console.log(formatReport(rows));
      console.log("");
      console.log(
        "* = Pareto frontier within its area (pass rate up, tokens down)"
      );
      for (const [area, route] of Object.entries(chooseRoute(rows)))
        console.log(
          `${area}: ${route.agent}/${route.model} (${route.measured ? "measured" : "preference"}) ${route.evidence}`
        );
      return;
    }
    const routing = buildRouting(
      rows,
      new Date().toISOString().slice(0, 10),
      (results.records ?? []).length
    );
    writeFileSync(ROUTING_FILE, `${JSON.stringify(routing, null, 2)}\n`);
    console.log(`wrote ${ROUTING_FILE}`);
    return;
  }
  throw new Error("Usage: routing.mjs report|write|route [args]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = EXIT_ERROR;
  }
}
