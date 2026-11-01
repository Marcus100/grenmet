#!/usr/bin/env node
// Post-deploy smoke test for staging. Plain fetch, no dependencies.
// The checks live in scripts/ops/staging-smoke.checks.json so agents can add
// one without touching this file. Nothing here prints a credential: the basic
// auth value is read from STAGING_BASIC_AUTH ("user:password") and only ever
// sent as an Authorization header.
//
// Usage: node scripts/ops/staging-smoke.mjs [--checks file] [--out summary.md]
//        [--wait-minutes 10]
// Exit code 1 when any non-optional check fails.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STAGING_HOST = /^https:\/\/[a-z0-9-]+\.staging\.barrels\.gd(\/|$)/;
const REQUEST_TIMEOUT_MS = 20_000;

export function authHeaders(basicAuth) {
  if (!basicAuth) {
    return {};
  }
  return {
    authorization: `Basic ${Buffer.from(basicAuth).toString("base64")}`,
  };
}

function headProblems(check, response) {
  const problems = [];
  const expected = check.expectStatus ?? [200];
  if (!expected.includes(response.status)) {
    problems.push(`status ${response.status}, expected ${expected.join("/")}`);
  }
  if (check.locationIncludes) {
    const location = response.headers.get("location") ?? "";
    if (!location.includes(check.locationIncludes)) {
      problems.push(`redirect does not point at ${check.locationIncludes}`);
    }
  }
  for (const name of check.headersPresent ?? []) {
    if (!response.headers.get(name)) {
      problems.push(`missing header ${name}`);
    }
  }
  return problems;
}

function jsonProblems(text, keys) {
  try {
    const json = JSON.parse(text);
    return keys
      .filter((key) => !(key in json))
      .map((key) => `JSON lacks key "${key}"`);
  } catch {
    return ["body is not JSON"];
  }
}

async function bodyProblems(check, response) {
  const needles = check.bodyIncludes ?? [];
  const keys = check.jsonKeys ?? [];
  if (needles.length === 0 && keys.length === 0) {
    return [];
  }
  const text = await response.text();
  const problems = needles
    .filter((needle) => !text.includes(needle))
    .map((needle) => `body lacks "${needle}"`);
  return keys.length > 0
    ? [...problems, ...jsonProblems(text, keys)]
    : problems;
}

/**
 * Runs one check against a fetch implementation and returns
 * { id, name, ok, optional, detail }. Never throws.
 */
export async function runCheck(check, { fetchImpl = fetch, headers = {} }) {
  const result = {
    id: check.id,
    name: check.name ?? check.id,
    optional: check.optional === true,
    ok: false,
    detail: "",
  };
  if (!STAGING_HOST.test(check.url)) {
    result.detail = "refused: the URL is not a staging.barrels.gd host";
    return result;
  }
  try {
    const response = await fetchImpl(check.url, {
      method: check.method ?? "GET",
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const problems = [
      ...headProblems(check, response),
      ...(await bodyProblems(check, response)),
    ];
    result.ok = problems.length === 0;
    result.detail = result.ok ? `HTTP ${response.status}` : problems.join("; ");
  } catch (error) {
    result.detail = `request failed: ${error?.name ?? "error"}`;
  }
  return result;
}

export async function runChecks(config, options) {
  const results = [];
  for (const check of config.checks) {
    results.push(await runCheck(check, options));
  }
  return results;
}

export function failed(results) {
  return results.filter((result) => !(result.ok || result.optional));
}

export function renderSummary(results, { sha = "", date = "" } = {}) {
  const bad = failed(results);
  const lines = [
    `## Staging smoke: ${bad.length === 0 ? "passed" : "FAILED"}`,
    "",
    `${date} ${sha ? `staging \`${sha.slice(0, 9)}\`` : ""}`.trim(),
    "",
    "| Check | Result | Detail |",
    "| --- | --- | --- |",
  ];
  for (const result of results) {
    let mark = "FAIL";
    if (result.ok) {
      mark = "pass";
    } else if (result.optional) {
      mark = "warn";
    }
    lines.push(`| ${result.name} | ${mark} | ${result.detail} |`);
  }
  lines.push(
    "",
    "Still for a person or agent: the signed-in checks (docs/operations/staging-promotion-automation.md)."
  );
  return lines.join("\n");
}

/** Polls the wait-for check until it passes or the deadline passes. */
export async function waitForHealthy(
  check,
  { fetchImpl = fetch, headers = {}, minutes = 10, sleep = defaultSleep } = {}
) {
  const deadline = Date.now() + minutes * 60_000;
  let last = await runCheck(check, { fetchImpl, headers });
  while (!last.ok && Date.now() < deadline) {
    await sleep(15_000);
    last = await runCheck(check, { fetchImpl, headers });
  }
  return last;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const configPath = option(
    "--checks",
    fileURLToPath(new URL("staging-smoke.checks.json", import.meta.url))
  );
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const headers = authHeaders(process.env.STAGING_BASIC_AUTH);
  const waitCheck = config.checks.find((check) => check.id === config.waitFor);
  if (waitCheck) {
    const health = await waitForHealthy(waitCheck, {
      headers,
      minutes: Number(option("--wait-minutes", "10")),
    });
    if (!health.ok) {
      console.log(`Staging never became healthy: ${health.detail}`);
    }
  }
  const results = await runChecks(config, { headers });
  const summary = renderSummary(results, {
    sha: process.env.STAGING_SHA ?? "",
    date: new Date().toISOString().slice(0, 10),
  });
  console.log(summary);
  const out = option("--out", "");
  if (out) {
    writeFileSync(out, `${summary}\n`);
  }
  if (failed(results).length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
