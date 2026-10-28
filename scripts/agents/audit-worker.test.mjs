import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hourly, runWithRetry, sixHourlyPlan } from "./audit-checks.mjs";
import { aggregateReceipt, daily } from "./audit-daily.mjs";
import { testEnvironment } from "./audit-process.mjs";
import { groupKey } from "./audit-security.mjs";
import { cleanCheckout, executePlan, SCHEDULES } from "./audit-worker.mjs";

const sha = "a".repeat(40);
const NOT_RUN_PATTERN = /not run/;
const PRIVATE_OUTPUT_PATTERN = /private failure output|private details/;
const FAILURE_NAMES_PATTERN = /lint \/ frontend/;
const API_TESTS_PATTERN = /API tests/;
const WORKFLOW_EVIDENCE_PATTERN =
  /Evidence: https:\/\/github\.com\/Marcus100\/grenmet\/actions\/runs\/77/;
const UNSAFE_JOB_NAME_PATTERN = /secret-name|with newline/;
const DAILY_ENDPOINT_LEAK_PATTERN =
  /user:pass|token=do-not-print|plain\.example|query\.example|prod\.example/;
const CERTIFICATE_REMAINING_PATTERN = /12 more days/;
const CHECKOUT_EXISTS_PATTERN = /already exists/;
const CHECKOUT_PINNED_PATTERN = /not clean and pinned/;
const UTC_SUFFIX_PATTERN = /UTC$/;
const tempDirectory = (t, prefix) => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

test("retries a failed command exactly once and marks a retry success as flaky", async () => {
  const spec = { id: "type-check", argv: ["pnpm", "type-check"] };
  const attempts = [];
  const result = await runWithRetry(spec, (received) => {
    attempts.push(received.id);
    return attempts.length === 1
      ? { code: 1, stdout: "", stderr: "failure" }
      : { code: 0, stdout: "ok", stderr: "" };
  });
  assert.deepEqual(attempts, ["type-check", "type-check"]);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.status, "pass");
  assert.equal(result.flaky, true);
});

test("requires exactly one Alembic head, rejecting zero and multiple heads", async () => {
  const spec = { id: "heads", argv: ["alembic", "heads"], oneHead: true };
  for (const stdout of ["", "one (head)\ntwo (head)\n"]) {
    let executions = 0;
    const result = await runWithRetry(spec, () => {
      executions++;
      return { code: 0, stdout, stderr: "" };
    });
    assert.equal(result.status, "fail");
    assert.equal(result.attempts.length, 2);
    assert.equal(executions, 2);
  }
  const exactlyOne = await runWithRetry(spec, () => ({
    code: 0,
    stdout: "revision (head)\n",
    stderr: "",
  }));
  assert.equal(exactlyOne.status, "pass");
  assert.equal(exactlyOne.attempts.length, 1);
});

test("six-hour plan discovers every app test script and all six migration configs", (t) => {
  const root = tempDirectory(t, "audit-plan-");
  const web = join(root, "apps", "web");
  for (const [app, scripts] of Object.entries({
    alpha: { test: "vitest run" },
    beta: { test: "node --test" },
    gamma: { build: "next build" },
  })) {
    const directory = join(web, app);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ scripts }));
  }
  const api = join(root, "apps", "api", "fastapi");
  for (const config of [
    "alembic.ini",
    "domains/auth/alembic.ini",
    "domains/wx/alembic.ini",
    "domains/hr/alembic.ini",
    "domains/cap/alembic.ini",
    "domains/audit/alembic.ini",
  ]) {
    const path = join(api, config);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "[alembic]\n");
  }
  const plan = sixHourlyPlan(root);
  assert.deepEqual(
    plan
      .filter((item) => item.id.startsWith("tests:"))
      .map((item) => item.id)
      .sort(),
    ["tests:alpha", "tests:beta"]
  );
  const migrations = plan.filter((item) => item.id.startsWith("migration:"));
  assert.equal(migrations.length, 6);
  assert.ok(migrations.every((item) => item.oneHead));
});

test("dependency setup failure makes subsequent planned checks unknown and unrun", async () => {
  const calls = [];
  const results = await executePlan(
    [
      { id: "install", argv: ["pnpm", "install"], prerequisite: true },
      { id: "tests:app", argv: ["pnpm", "test"] },
    ],
    "/audit",
    "/private/logs",
    (argv) => {
      calls.push(argv);
      return {
        code: 1,
        stdout: "private failure output",
        stderr: "private details",
      };
    }
  );
  assert.deepEqual(calls, [
    ["pnpm", "install"],
    ["pnpm", "install"],
  ]);
  assert.equal(results[0].status, "fail");
  assert.equal(results[1].status, "unknown");
  assert.match(results[1].summary, NOT_RUN_PATTERN);
  assert.doesNotMatch(JSON.stringify(results), PRIVATE_OUTPUT_PATTERN);
});

test("hourly failed workflow reports exact failing checks and a run evidence link", async () => {
  const gh = (args) => {
    if (args[0] === "api" && args[3].includes("actions/runs?"))
      return [
        { workflow_runs: [{ workflow_id: 7, id: 77, conclusion: "failure" }] },
      ];
    if (args[0] === "api" && args[3].includes("/jobs?"))
      return [
        {
          jobs: [
            {
              id: 770,
              name: "lint / frontend",
              conclusion: "failure",
              html_url:
                "https://github.com/Marcus100/grenmet/actions/runs/77/job/770",
            },
            {
              id: 771,
              name: "API tests",
              conclusion: "timed_out",
              html_url:
                "https://github.com/Marcus100/grenmet/actions/runs/77/job/771",
            },
            {
              id: 772,
              name: "secret-name\nwith newline",
              conclusion: "failure",
            },
          ],
        },
      ];
    if (args[0] === "pr") return [];
    if (args[0] === "api") return [[]];
    throw new Error("unexpected mocked request");
  };
  const observations = await hourly({ gh, commit: sha });
  const finding = observations.find((item) => item.key === "dev-workflow:7");
  assert.equal(finding.status, "fail");
  assert.match(finding.summary, FAILURE_NAMES_PATTERN);
  assert.match(finding.summary, API_TESTS_PATTERN);
  assert.match(finding.summary, WORKFLOW_EVIDENCE_PATTERN);
  assert.doesNotMatch(finding.summary, UNSAFE_JOB_NAME_PATTERN);
});

test("hourly request failures create coverage findings and resolved alerts report pass", async () => {
  const gh = (args) => {
    if (args[0] === "api" && args[3].includes("actions/runs?"))
      throw new Error("private API error");
    if (args[0] === "pr") return [];
    if (args[0] === "api" && args[3].includes("dependabot/alerts"))
      return [
        [
          {
            number: 10,
            dependency: {
              package: { name: "pillow" },
              manifest_path: "uv.lock",
            },
            state: "resolved",
            security_advisory: { severity: "moderate" },
          },
        ],
      ];
    if (args[0] === "api") return [[]];
    throw new Error("unexpected mocked request");
  };
  const observations = await hourly({ gh, commit: sha });
  const coverage = observations.find(
    (item) => item.key === "coverage:dev-checks"
  );
  const pullCoverage = observations.find(
    (item) => item.key === "coverage:pull-requests"
  );
  const alertCoverage = observations.find(
    (item) => item.key === "coverage:dependabot"
  );
  const resolved = observations.find(
    (item) => item.key === groupKey("pillow", "uv.lock")
  );
  assert.equal(coverage?.status, "fail");
  assert.equal(coverage?.owner, "owner");
  assert.equal(pullCoverage?.status, "pass");
  assert.equal(alertCoverage?.status, "pass");
  assert.equal(resolved?.status, "pass");
});

test("daily probes accept only clean HTTPS endpoints and never publish endpoint URLs", async () => {
  const requests = [];
  const config = {
    endpoints: {
      staging: [
        "https://stage.example.test/health",
        "http://plain.example.test/",
        "https://user:pass@private.example.test/",
        "https://query.example.test/health?token=do-not-print",
      ],
      production: ["https://prod.example.test/health#fragment"],
    },
    receipts: {},
  };
  const results = await daily({
    config,
    now: Date.parse("2026-10-25T12:00:00Z"),
    fetchHttp: (url, options) => {
      requests.push({ href: url.href, options });
      throw new Error("redirect response should never be followed or surfaced");
    },
    daysRemaining: () => 30,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.redirect, "error");
  assert.equal(
    results.some(
      (item) => item.status === "fail" && item.key === "health:staging:0"
    ),
    true
  );
  const publicFields = JSON.stringify(results);
  assert.doesNotMatch(publicFields, DAILY_ENDPOINT_LEAK_PATTERN);
  assert.equal(
    results.some((item) => item.key === "coverage:daily:staging-endpoint-1"),
    true
  );
  assert.equal(
    results.some((item) => item.key === "coverage:daily:production-endpoint-0"),
    true
  );
});

test("daily flags near-expiry certificates while an accepted HTTPS response can pass", async () => {
  const results = await daily({
    config: {
      endpoints: {
        staging: ["https://stage.example.test/ready"],
        production: [],
      },
      receipts: {},
    },
    now: Date.parse("2026-10-25T12:00:00Z"),
    fetchHttp: () => ({
      ok: true,
      body: { cancel: () => Promise.resolve() },
    }),
    daysRemaining: () => 12.9,
  });
  assert.equal(
    results.find((item) => item.key === "health:staging:0")?.status,
    "pass"
  );
  assert.equal(
    results.find((item) => item.key === "certificate:staging:0")?.status,
    "fail"
  );
  assert.match(
    results.find((item) => item.key === "certificate:staging:0").summary,
    CERTIFICATE_REMAINING_PATTERN
  );
});

test("aggregate receipts require fresh complete counts for both environments and Sentry MCP provenance", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  const receipt = (source, overrides = {}) => ({
    source,
    complete: true,
    observedAt: "2026-10-25T11:00:00Z",
    ...(source === "sentry" ? { via: "sentry-mcp" } : {}),
    environments: { staging: { failures: 2 }, production: { failures: 0 } },
    ...overrides,
  });
  const valid = aggregateReceipt("sentry", receipt("sentry"), now);
  assert.deepEqual(
    valid.map((item) => item.key),
    ["daily:sentry:staging", "daily:sentry:production", "coverage:daily:sentry"]
  );
  assert.deepEqual(
    valid.slice(0, 2).map((item) => item.status),
    ["fail", "pass"]
  );
  for (const invalid of [
    receipt("sentry", { complete: false }),
    receipt("sentry", { observedAt: "2026-10-23T00:00:00Z" }),
    receipt("sentry", { via: "http" }),
    receipt("sentry", { environments: { staging: { failures: 0 } } }),
    receipt("sentry", {
      environments: { staging: { failures: "2" }, production: { failures: 0 } },
    }),
  ]) {
    const result = aggregateReceipt("sentry", invalid, now);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "fail");
    assert.equal(result[0].key, "coverage:daily:sentry");
  }
});

test("clean checkout refuses existing work and rejects a checkout at a different commit without real Git", async (t) => {
  const root = "/mock/root";
  const directory = tempDirectory(t, "audit-checkout-");
  const existing = join(directory, "existing");
  mkdirSync(existing);
  let calls = 0;
  await assert.rejects(
    cleanCheckout(root, existing, sha, () => {
      calls++;
      return { code: 0, stdout: "" };
    }),
    CHECKOUT_EXISTS_PATTERN
  );
  assert.equal(calls, 0);
  const absent = join(directory, "new-checkout");
  const run = (argv) => {
    calls++;
    if (argv[1] === "worktree") return { code: 0, stdout: "" };
    if (argv[1] === "status") return { code: 0, stdout: "" };
    if (argv[1] === "rev-parse") return { code: 0, stdout: "b".repeat(40) };
    throw new Error("unexpected mocked Git command");
  };
  await assert.rejects(
    cleanCheckout(root, absent, sha, run),
    CHECKOUT_PINNED_PATTERN
  );
  assert.equal(calls, 3);
});

test("test environment inherits only a minimal allowlist and uses disposable local service settings", () => {
  const result = testEnvironment({
    HOME: "/home/audit",
    PATH: "/usr/bin",
    LANG: "C.UTF-8",
    GH_TOKEN: "do-not-inherit",
    GITHUB_TOKEN: "do-not-inherit",
    AWS_SECRET_ACCESS_KEY: "do-not-inherit",
    DATABASE_URL: "postgres://production",
    POSTGRES_SERVER: "production.db.internal",
    REDIS_URL: "redis://production.internal/0",
  });
  assert.equal(result.HOME, "/nonexistent");
  assert.equal(result.PATH, "/usr/bin");
  assert.equal(result.GH_TOKEN, undefined);
  assert.equal(result.GITHUB_TOKEN, undefined);
  assert.equal(result.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(result.DATABASE_URL, undefined);
  assert.equal(result.POSTGRES_SERVER, "127.0.0.1");
  assert.equal(result.POSTGRES_DB, "verification");
  assert.equal(result.REDIS_URL, "redis://127.0.0.1:6379/15");
});

test("all four worker schedules are explicit UTC schedules", () => {
  assert.deepEqual(Object.keys(SCHEDULES).sort(), [
    "daily",
    "hourly",
    "sixhourly",
    "weekly",
  ]);
  for (const schedule of Object.values(SCHEDULES))
    assert.match(schedule, UTC_SUFFIX_PATTERN);
});

test("six-hour Turbo checks pin their working directory and cache to the disposable checkout", (t) => {
  const root = tempDirectory(t, "audit-turbo-root-");
  mkdirSync(join(root, "apps/web"), { recursive: true });
  mkdirSync(join(root, "apps/api/fastapi"), { recursive: true });
  const plan = sixHourlyPlan(root);
  for (const id of ["types", "lint"]) {
    const argv = plan.find((item) => item.id === id).argv;
    assert.equal(argv[argv.indexOf("--cwd") + 1], root);
    assert.equal(
      argv[argv.indexOf("--cache-dir") + 1],
      join(root, ".turbo/cache")
    );
  }
});
