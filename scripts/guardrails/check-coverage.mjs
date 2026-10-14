#!/usr/bin/env node
// Coverage floors that only rise. Each web app with the v8 provider and the API
// has a line and branch floor in coverage-baseline.json; this fails when a
// measurement falls below its floor. Lowering a floor is a human decision: the
// baseline file is a high-risk path in risk-tier.mjs.
//
// Usage: node scripts/guardrails/check-coverage.mjs [--only api|web] [--write]
//   Web summaries: apps/web/<app>/coverage/coverage-summary.json (vitest json-summary)
//   API report:    apps/api/fastapi/coverage.xml (pytest-cov Cobertura XML)
//   --write raises floors to the measured value minus the noise margin; it never lowers one.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = join(root, "scripts/guardrails/coverage-baseline.json");
const METRICS = ["lines", "branches"];
const NOISE_MARGIN = 0.5;
const PERCENT = 100;
const ROUND = 10;
const WEB_PREFIX = /^web\//;
const ROOT_ATTRIBUTES = /<coverage\b[^>]*>/;
const RATE = (name) => new RegExp(`\\b${name}="([0-9.]+)"`);
const LINE_RATE = RATE("line-rate");
const BRANCH_RATE = RATE("branch-rate");

const round = (value) => Math.round(value * ROUND) / ROUND;

// Percentages from a vitest json-summary document.
export function parseSummary(json) {
  const total = json?.total;
  if (!(total?.lines && total?.branches))
    throw new Error("coverage summary has no total lines and branches");
  return { branches: total.branches.pct, lines: total.lines.pct };
}

// Percentages from a Cobertura coverage.xml root element.
export function parseCobertura(xml) {
  const head = ROOT_ATTRIBUTES.exec(xml)?.[0];
  const line = head && LINE_RATE.exec(head)?.[1];
  const branch = head && BRANCH_RATE.exec(head)?.[1];
  if (line === undefined || branch === undefined)
    throw new Error("coverage.xml has no line-rate and branch-rate");
  return {
    branches: round(Number(branch) * PERCENT),
    lines: round(Number(line) * PERCENT),
  };
}

// Compares measurements with floors. A target without a measurement is reported
// as skipped, not failed, so a partial run (one app) still checks what it ran.
export function evaluate(floors, measured) {
  const failures = [];
  const passes = [];
  const skipped = [];
  for (const [target, wanted] of Object.entries(floors)) {
    const actual = measured[target];
    if (!actual) {
      skipped.push(target);
      continue;
    }
    for (const metric of METRICS) {
      const line = `${target} ${metric} ${actual[metric]}% (floor ${wanted[metric]}%)`;
      if (actual[metric] < wanted[metric]) failures.push(line);
      else passes.push(line);
    }
  }
  return { failures, passes, skipped };
}

// Raises floors to measured minus the noise margin. Never lowers, never adds
// a target that is not already tracked.
export function raiseFloors(floors, measured) {
  const next = structuredClone(floors);
  for (const [target, actual] of Object.entries(measured)) {
    if (!next[target]) continue;
    for (const metric of METRICS) {
      const candidate = round(Math.max(0, actual[metric] - NOISE_MARGIN));
      if (candidate > next[target][metric]) next[target][metric] = candidate;
    }
  }
  return next;
}

function readMeasurements(only) {
  const measured = {};
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  for (const target of Object.keys(baseline.floors)) {
    if (target === "api") {
      const file = join(root, "apps/api/fastapi/coverage.xml");
      if (only !== "web" && existsSync(file))
        measured.api = parseCobertura(readFileSync(file, "utf8"));
    } else {
      const app = target.replace(WEB_PREFIX, "");
      const file = join(
        root,
        "apps/web",
        app,
        "coverage/coverage-summary.json"
      );
      if (only !== "api" && existsSync(file))
        measured[target] = parseSummary(JSON.parse(readFileSync(file, "utf8")));
    }
  }
  return { baseline, measured };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const only = args.includes("--only")
      ? args[args.indexOf("--only") + 1]
      : undefined;
    const { baseline, measured } = readMeasurements(only);
    const { failures, passes, skipped } = evaluate(baseline.floors, measured);
    for (const line of passes) console.log(`ok   ${line}`);
    for (const target of skipped)
      console.log(`skip ${target} (no coverage report found)`);
    if (args.includes("--write")) {
      baseline.floors = raiseFloors(baseline.floors, measured);
      writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
      console.log("floors raised where coverage improved");
    }
    for (const line of failures) console.error(`FAIL ${line}`);
    if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
