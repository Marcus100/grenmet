#!/usr/bin/env node
// Publishes the droplet runners' daily monitoring receipts as `codex-audit` issues.
//
// `.github/workflows/monitoring-daily.yml` collects one receipt per environment on
// that environment's self-hosted runner (scripts/monitoring/daily_receipts.py),
// then a GitHub-hosted job runs this script with an `issues: write` token. The
// two halves are merged into the same per-source receipts the WSL auditor reads,
// so observation keys, titles, bodies and grouping are identical and the existing
// issues (#644 to #648) open, update and close by their markers. A missing,
// stale or incomplete half is a coverage gap; an unknown result never closes.
//
// Dead-man's switch: every collect job that starts uploads a file, either a
// disabled marker or its receipt (a placeholder with no sources until the
// collector overwrites it). So "every environment disabled" (nothing to do) is
// distinguishable from "nothing arrived" (runner offline or job never ran) and
// from "a collector failed" (published as a gap). The last two exit non-zero.

import { execFile } from "node:child_process";
import { appendFileSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { groupObservations } from "./audit-checks.mjs";
import {
  aggregateReceipt,
  DAILY_ROOT_CAUSES,
  DAILY_SOURCES,
} from "./audit-daily.mjs";
import { publishObservations } from "./audit-report.mjs";

export const REPO = "Marcus100/grenmet";
export const BOT_LOGIN = "github-actions[bot]";
const ENVIRONMENTS = ["staging", "production"];
const RECEIPT_FILE = /^daily-receipt-(staging|production)\.json$/;
const MAX_BYTES = 65_536;
const MAX_AGE_MS = 26 * 3_600_000;

function fresh(receipt, environment, now) {
  const observed = Date.parse(receipt?.observedAt);
  return (
    receipt?.version === 1 &&
    receipt.environment === environment &&
    Number.isFinite(observed) &&
    observed <= now &&
    now - observed <= MAX_AGE_MS
  );
}

function validHalf(receipt) {
  return (
    receipt.disabled === undefined &&
    receipt.sources !== null &&
    typeof receipt.sources === "object" &&
    !Array.isArray(receipt.sources)
  );
}

// Same file rules as the WSL auditor: a private (no group/other bits) regular
// file under 64 KB, fresher than 26 hours and not from the future. Returns the
// receipt halves and the environments that reported themselves disabled.
export function readEnvironmentReceipts(directory, now = Date.now()) {
  const halves = {};
  const disabled = new Set();
  let names;
  try {
    names = readdirSync(directory);
  } catch {
    return { halves, disabled };
  }
  for (const name of names) {
    const match = RECEIPT_FILE.exec(name);
    if (!match) continue;
    try {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.size > MAX_BYTES || stat.mode % 64) continue;
      const receipt = JSON.parse(readFileSync(path, "utf8"));
      if (!fresh(receipt, match[1], now)) continue;
      if (receipt.disabled === true) disabled.add(match[1]);
      else if (validHalf(receipt)) halves[match[1]] = receipt;
    } catch {
      // An unreadable half is treated as missing, which is a coverage gap.
    }
  }
  return { halves, disabled };
}

export function parseExpected(value = "staging,production") {
  const expected = [...new Set(value.split(",").map((item) => item.trim()))];
  if (
    !expected.length ||
    expected.some((environment) => !ENVIRONMENTS.includes(environment))
  )
    throw new Error("--expect must list staging and/or production");
  return expected;
}

function completeEntry(item) {
  return (
    item?.complete === true &&
    Number.isSafeInteger(item.failures) &&
    item.failures >= 0
  );
}

export function mergedReceipt(source, halves) {
  const entries = ENVIRONMENTS.map(
    (environment) => halves[environment]?.sources?.[source]
  );
  if (!entries.every(completeEntry)) return { source, complete: false };
  const observedAt = ENVIRONMENTS.map((environment) =>
    Date.parse(halves[environment].observedAt)
  ).reduce((oldest, value) => Math.min(oldest, value));
  return {
    source,
    complete: true,
    observedAt: new Date(observedAt).toISOString(),
    ...(source === "sentry" ? { via: "sentry-api" } : {}),
    environments: Object.fromEntries(
      ENVIRONMENTS.map((environment, index) => [
        environment,
        { failures: entries[index].failures },
      ])
    ),
  };
}

export function runnerObservations(halves, now = Date.now()) {
  return groupObservations(
    DAILY_SOURCES.flatMap((source) =>
      aggregateReceipt(source, mergedReceipt(source, halves), now)
    ),
    DAILY_ROOT_CAUSES
  );
}

export function ghRunner(env) {
  return (args) =>
    new Promise((done, fail) => {
      execFile(
        "gh",
        args,
        {
          env: {
            PATH: env.PATH,
            HOME: env.HOME,
            GH_TOKEN: env.GH_TOKEN,
            GH_PROMPT_DISABLED: "1",
          },
          timeout: 120_000,
          maxBuffer: 16_000_000,
        },
        (error, stdout) => {
          // Never surface gh's stderr: it can echo request details.
          if (error) fail(new Error("Issue publication unavailable"));
          else done(stdout.trim());
        }
      );
    });
}

function summary(environments, missing, observations, result, publish) {
  const lines = [
    `### Daily monitoring publication (${publish ? "published" : "dry run"})`,
    "",
    `Receipts: ${environments.length ? environments.join(", ") : "none"}`,
    ...(missing.length
      ? [
          "",
          `**No report from: ${missing.join(", ")}.** The runner was offline or its collector failed; published as a coverage gap.`,
        ]
      : []),
    "",
    "| Observation | Status |",
    "| --- | --- |",
    ...observations.map((item) => `| \`${item.key}\` | ${item.status} |`),
    "",
  ];
  for (const action of ["created", "updated", "reopened", "closed", "deferred"])
    if (result[action]?.length)
      lines.push(
        `- ${action}: ${result[action]
          .map((item) =>
            item.issueNumber ? `#${item.issueNumber}` : `\`${item.key}\``
          )
          .join(", ")}`
      );
  return `${lines.join("\n")}\n`;
}

export async function main(
  argv = process.argv.slice(2),
  { env = process.env, runGh = ghRunner(env), now = Date.now() } = {}
) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "input-dir": { type: "string" },
      publish: { type: "boolean" },
      expect: { type: "string", default: "staging,production" },
      "collect-result": { type: "string", default: "success" },
    },
  });
  if (env.GITHUB_REPOSITORY !== REPO)
    throw new Error("Runs only in the canonical repository");
  const expected = parseExpected(values.expect);
  const { halves, disabled } = readEnvironmentReceipts(
    values["input-dir"],
    now
  );
  const note = (message) => {
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, `${message}\n`);
  };
  const environments = Object.keys(halves).sort();
  const missing = expected.filter(
    (environment) => !(halves[environment] || disabled.has(environment))
  );
  if (missing.length === expected.length) {
    // Nothing arrived, so the enabled state is unknown: fail loudly, but do not
    // touch the issues (this also happens while monitoring is still disabled).
    note(
      `No collector reported (${missing.join(", ")}): runner offline or job never ran. Nothing published.`
    );
    return { published: false, healthy: false, environments, missing };
  }
  if (expected.every((environment) => disabled.has(environment))) {
    // Every environment is intentionally off (the default): change nothing.
    note(
      "Daily monitoring is disabled in every environment; nothing published."
    );
    return { published: false, healthy: true, environments, missing };
  }
  const observations = runnerObservations(halves, now);
  const publish = Boolean(values.publish);
  const result = await publishObservations({
    observations,
    repo: REPO,
    commit: env.GITHUB_SHA,
    runGh,
    dryRun: !publish,
    nowISO: new Date(now).toISOString(),
    // GITHUB_TOKEN cannot read `gh api user`; it acts as the Actions bot. The
    // existing issues were opened by the repository owner's audit identity.
    login: BOT_LOGIN,
    trustedAuthors: env.GITHUB_REPOSITORY_OWNER
      ? [env.GITHUB_REPOSITORY_OWNER]
      : [],
  });
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      summary(environments, missing, observations, result, publish)
    );
  return {
    published: publish,
    healthy: !missing.length && values["collect-result"] === "success",
    environments,
    missing,
    created: result.created.length,
    updated: result.updated.length,
    reopened: result.reopened.length,
    closed: result.closed.length,
    deferred: result.deferred.length,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then((result) => {
      console.log(JSON.stringify(result));
      // A missing or failed collector fails the job after publishing its gap.
      if (!result.healthy) process.exitCode = 1;
    })
    .catch(() => {
      console.error(
        "Daily monitoring publication could not complete; no receipt content was printed."
      );
      process.exitCode = 1;
    });
}
