import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertStagingOnly,
  buildBody,
  gate,
  migrationsFromDiff,
  pullNumbers,
} from "../ops/promote-staging.mjs";
import {
  authHeaders,
  failed,
  renderSummary,
  runCheck,
  waitForHealthy,
} from "../ops/staging-smoke.mjs";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const promote = read(".github/workflows/promote-staging.yml");
const smoke = read(".github/workflows/staging-smoke.yml");
const ACTION_REF = /uses: ([^\s#]+)/g;
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const WORKFLOW_PERMISSIONS =
  /permissions:\n {2}contents: read\n {2}pull-requests: write\n {2}issues: write/;
const CONTENTS_WRITE = /contents: write/;
const FORBIDDEN_COMMANDS = /gh release|git tag|git push|--admin/;
const PROD_PIPELINES = /pipeline-prod|deploy-prod/;
const BODY_AREA = /\*\*area:ci\*\*/;
const BODY_PR1 = /#1 ci: a \(risk:high\)/;
const BODY_MIGRATION = /rosterrulesets20261031/;
const BODY_SECURITY_YES =
  /#1 risk:high, security review section in its body: yes/;
const BODY_SECURITY_NO =
  /#3 risk:high, security review section in its body: NO/;
const BODY_AFTER_MERGE = /## After merge/;
const SMOKE_FAILED = /FAILED/;
const STAGING_URL = /^https:\/\/[a-z0-9-]+\.staging\.barrels\.gd\//;
const MERGE_TARGET = /--base\s+(main|production)|--head\s+staging/;

test("promotion and smoke workflows pin every action by full SHA", () => {
  for (const source of [promote, smoke])
    for (const [, ref] of source.matchAll(ACTION_REF))
      assert.match(ref, PINNED, ref);
});

test("promotion automation never targets main, production, tags or releases", () => {
  for (const source of [
    promote,
    smoke,
    read("scripts/ops/promote-staging.mjs"),
  ]) {
    assert.doesNotMatch(source, MERGE_TARGET);
    assert.doesNotMatch(source, FORBIDDEN_COMMANDS);
    assert.doesNotMatch(source, PROD_PIPELINES);
  }
  assert.throws(() => assertStagingOnly("main", "staging"));
  assert.throws(() => assertStagingOnly("staging", "main"));
  assert.doesNotThrow(() => assertStagingOnly("staging", "dev"));
});

test("promotion is off by default and the hold switch stops it", () => {
  assert.equal(gate({}).run, false);
  assert.equal(gate({ PROMOTE_STAGING_ENABLED: "false" }).run, false);
  assert.equal(gate({ PROMOTE_STAGING_ENABLED: "true" }).run, true);
  assert.equal(
    gate({ PROMOTE_STAGING_ENABLED: "true", PROMOTE_STAGING_HOLD: "true" }).run,
    false
  );
  assert.equal(
    gate({
      PROMOTE_STAGING_ENABLED: "true",
      PROMOTE_STAGING_HOLD: "true",
      RESPECT_HOLD: "false",
    }).run,
    true
  );
  assert.equal(gate({ IGNORE_ENABLED_SWITCH: "true" }).run, true);
  assert.ok(promote.includes("ignore_enabled_switch"));
  assert.ok(promote.includes("vars.PROMOTE_STAGING_ENABLED"));
  assert.ok(promote.includes("concurrency:"));
  assert.ok(promote.includes('cron: "0 10 * * *"'));
});

test("workflows keep minimal permissions", () => {
  for (const source of [promote, smoke]) {
    assert.match(source, WORKFLOW_PERMISSIONS);
    assert.doesNotMatch(source, CONTENTS_WRITE);
  }
});

test("promotion body lists PRs, migrations and risk:high security sections", () => {
  assert.deepEqual(
    pullNumbers([
      "Merge pull request #12 from a/b",
      "fix: x",
      "Merge pull request #7 from c/d",
    ]),
    [12, 7]
  );
  assert.deepEqual(
    migrationsFromDiff([
      "A\tapps/api/fastapi/src/hr/alembic/versions/rosterrulesets20261031.py",
      "M\tapps/api/fastapi/src/hr/alembic/versions/old.py",
      "A\tdocs/readme.md",
    ]),
    ["rosterrulesets20261031"]
  );
  const body = buildBody({
    date: "2026-11-01",
    sha: "8bef9005c0000",
    migrations: ["rosterrulesets20261031"],
    unlistedCommits: 0,
    pulls: [
      {
        number: 1,
        title: "ci: a",
        labels: [{ name: "area:ci" }, { name: "risk:high" }],
        body: "## Security review\nok",
      },
      { number: 2, title: "feat: b", labels: [{ name: "risk:low" }], body: "" },
      {
        number: 3,
        title: "fix: c",
        labels: [{ name: "risk:high" }],
        body: "none",
      },
    ],
  });
  assert.match(body, BODY_AREA);
  assert.match(body, BODY_PR1);
  assert.match(body, BODY_MIGRATION);
  assert.match(body, BODY_SECURITY_YES);
  assert.match(body, BODY_SECURITY_NO);
  assert.match(body, BODY_AFTER_MERGE);
});

const response = (status, body = "", headers = {}) => ({
  status,
  headers: new Headers(headers),
  text: async () => body,
});
const check = (extra) => ({
  id: "c",
  url: "https://api.staging.barrels.gd/x",
  ...extra,
});

test("smoke check passes and fails on status, body, headers and JSON", async () => {
  const ok = (r) => async () => r;
  assert.equal(
    (await runCheck(check({}), { fetchImpl: ok(response(200)) })).ok,
    true
  );
  assert.equal(
    (await runCheck(check({}), { fetchImpl: ok(response(500)) })).ok,
    false
  );
  const notFound = check({
    expectStatus: [404],
    bodyIncludes: ["Page not found"],
  });
  assert.equal(
    (
      await runCheck(notFound, {
        fetchImpl: ok(response(404, "<h1>Page not found</h1>")),
      })
    ).ok,
    true
  );
  assert.equal(
    (await runCheck(notFound, { fetchImpl: ok(response(404, "oops")) })).ok,
    false
  );
  const headers = check({ headersPresent: ["x-frame-options"] });
  assert.equal(
    (
      await runCheck(headers, {
        fetchImpl: ok(response(200, "", { "x-frame-options": "DENY" })),
      })
    ).ok,
    true
  );
  assert.equal(
    (await runCheck(headers, { fetchImpl: ok(response(200)) })).ok,
    false
  );
  const json = check({ jsonKeys: ["items"] });
  assert.equal(
    (await runCheck(json, { fetchImpl: ok(response(200, '{"items":[]}')) })).ok,
    true
  );
  assert.equal(
    (await runCheck(json, { fetchImpl: ok(response(200, "x")) })).ok,
    false
  );
  const redirect = check({ expectStatus: [307], locationIncludes: "sign-in" });
  assert.equal(
    (
      await runCheck(redirect, {
        fetchImpl: ok(response(307, "", { location: "/sign-in" })),
      })
    ).ok,
    true
  );
  const boom = await runCheck(check({}), {
    fetchImpl: () => Promise.reject(new Error("secret-host")),
  });
  assert.equal(boom.ok, false);
  assert.ok(!boom.detail.includes("secret-host"));
});

test("smoke refuses non-staging hosts and never leaks credentials", async () => {
  let called = false;
  const result = await runCheck(
    { id: "p", url: "https://api.barrels.gd/" },
    {
      fetchImpl: () => {
        called = true;
        return Promise.resolve(response(200));
      },
    }
  );
  assert.equal(result.ok, false);
  assert.equal(called, false);
  assert.deepEqual(authHeaders(""), {});
  let seen;
  await runCheck(check({}), {
    headers: authHeaders("user:pass"),
    fetchImpl: (_url, init) => {
      seen = init.headers.authorization;
      return Promise.resolve(response(200));
    },
  });
  assert.equal(seen, `Basic ${Buffer.from("user:pass").toString("base64")}`);
  const summary = renderSummary(
    [{ id: "a", name: "A", ok: false, optional: false, detail: "status 500" }],
    { sha: "abcdef0123" }
  );
  assert.match(summary, SMOKE_FAILED);
  assert.ok(!summary.includes("user:pass"));
  assert.equal(failed([{ ok: false, optional: true }]).length, 0);
});

test("waitForHealthy retries until healthy", async () => {
  let calls = 0;
  const result = await waitForHealthy(check({}), {
    minutes: 1,
    sleep: () => Promise.resolve(),
    fetchImpl: () => Promise.resolve(response(++calls < 3 ? 503 : 200)),
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
});

test("the checks file is valid, staging-only and covers the required areas", () => {
  const config = JSON.parse(read("scripts/ops/staging-smoke.checks.json"));
  const ids = new Set(config.checks.map((c) => c.id));
  assert.equal(ids.size, config.checks.length);
  assert.ok(ids.has(config.waitFor));
  for (const c of config.checks) assert.match(c.url, STAGING_URL);
  for (const id of [
    "api-health",
    "api-ready",
    "weather-alerts",
    "cms-newsletter",
    "notfound-weather",
    "notfound-docs",
    "notfound-bookings",
  ])
    assert.ok(ids.has(id), id);
});
