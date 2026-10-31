import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BOT_LOGIN,
  main,
  mergedReceipt,
  parseExpected,
  readEnvironmentReceipts,
  runnerObservations,
} from "./audit-runner-publish.mjs";

const CLOSED_FIRST_LIVE_ISSUE = /closed: #644/;
const NO_COLLECTOR_PATTERN = /No collector reported/;
const NOW = Date.parse("2026-10-31T04:55:00Z");
const OBSERVED = "2026-10-31T04:50:00+00:00";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SOURCES = [
  "sentry",
  "eregister-sends",
  "wis2-sends",
  "worker-jobs",
  "notification-sweeps",
  "secrets",
  "backups",
];
// The live issues #644 to #648 carry these markers.
const LIVE = {
  644: "coverage:daily:sentry",
  645: "coverage:daily:delivery-monitoring",
  646: "coverage:daily:worker-telemetry",
  647: "coverage:daily:secrets",
  648: "coverage:daily:backups",
};

function half(environment, overrides = {}) {
  return {
    version: 1,
    environment,
    observedAt: OBSERVED,
    sources: Object.fromEntries(
      SOURCES.map((source) => [source, { complete: true, failures: 0 }])
    ),
    ...overrides,
  };
}

function directory(t, halves, mode = 0o600) {
  const dir = mkdtempSync(join(tmpdir(), "runner-publish-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const receipt of halves) {
    const path = join(dir, `daily-receipt-${receipt.environment}.json`);
    writeFileSync(path, JSON.stringify(receipt));
    chmodSync(path, mode);
  }
  return dir;
}

function liveIssue(number, key, author = "Marcus100") {
  const marker = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return {
    number: Number(number),
    state: "open",
    title: `Daily ${key.split(":").at(-1)} monitoring needs configuration`,
    user: { login: author },
    body: [
      "## Advisory audit observation",
      "",
      "- Status: **fail**",
      "- Observed: `2026-10-30T05:30:23.827Z`",
      "",
      `<!-- codex-audit:${marker} -->`,
    ].join("\n"),
  };
}

function fakeGh(issues) {
  const calls = [];
  const runGh = (args) => {
    calls.push(args);
    if (args[0] === "api" && args[1] === "user")
      return Promise.reject(
        new Error("GITHUB_TOKEN cannot read the user endpoint")
      );
    if (args[0] === "api") return Promise.resolve(JSON.stringify([issues]));
    if (args[0] === "label")
      return Promise.resolve(JSON.stringify([{ name: "codex-audit" }]));
    return Promise.resolve("");
  };
  runGh.calls = calls;
  return runGh;
}

const ENV = {
  GITHUB_REPOSITORY: "Marcus100/grenmet",
  GITHUB_REPOSITORY_OWNER: "Marcus100",
  GITHUB_SHA: COMMIT,
};

test("both complete halves pass every coverage observation", () => {
  const observations = runnerObservations(
    { staging: half("staging"), production: half("production") },
    NOW
  );
  const coverage = observations.filter((item) =>
    item.key.startsWith("coverage:")
  );
  assert.deepEqual(
    coverage.map((item) => item.key).sort(),
    Object.values(LIVE).sort()
  );
  assert.ok(coverage.every((item) => item.status === "pass"));
  assert.ok(
    observations.some((item) => item.key === "daily:sentry:production")
  );
});

test("a missing, incomplete or stale half is a gap and emits no daily counts", (t) => {
  const missing = runnerObservations({ staging: half("staging") }, NOW);
  assert.ok(missing.every((item) => item.status === "fail"));
  assert.ok(missing.every((item) => item.key.startsWith("coverage:")));

  const incomplete = half("production");
  incomplete.sources["worker-jobs"] = {
    complete: false,
    reason: "telemetry job coverage incomplete",
  };
  const observations = runnerObservations(
    { staging: half("staging"), production: incomplete },
    NOW
  );
  const status = (key) => observations.find((item) => item.key === key)?.status;
  assert.equal(status("coverage:daily:worker-telemetry"), "fail");
  assert.equal(status("coverage:daily:backups"), "pass");
  assert.equal(status("daily:worker-jobs:staging"), undefined);

  const dir = directory(t, [
    half("staging", { observedAt: "2026-10-29T00:00:00Z" }),
    half("production", { observedAt: "2026-10-31T06:00:00Z" }),
  ]);
  assert.deepEqual(readEnvironmentReceipts(dir, NOW).halves, {});
});

test("receipts must be private files named for their own environment", (t) => {
  assert.deepEqual(
    readEnvironmentReceipts(directory(t, [half("staging")], 0o644), NOW).halves,
    {}
  );
  const dir = directory(t, []);
  const path = join(dir, "daily-receipt-staging.json");
  writeFileSync(path, JSON.stringify(half("production")));
  chmodSync(path, 0o600);
  assert.deepEqual(readEnvironmentReceipts(dir, NOW).halves, {});
  assert.deepEqual(
    Object.keys(
      readEnvironmentReceipts(directory(t, [half("staging")]), NOW).halves
    ),
    ["staging"]
  );
});

test("merged Sentry receipts carry API provenance and the older timestamp", () => {
  const later = half("production", { observedAt: "2026-10-31T04:52:00Z" });
  later.sources.sentry = { complete: true, failures: 4 };
  const receipt = mergedReceipt("sentry", {
    staging: half("staging"),
    production: later,
  });
  assert.equal(receipt.via, "sentry-api");
  assert.equal(receipt.observedAt, "2026-10-31T04:50:00.000Z");
  assert.deepEqual(receipt.environments, {
    staging: { failures: 0 },
    production: { failures: 4 },
  });
});

test("publication closes the owner's live issues as the Actions bot without gh api user", async (t) => {
  const production = half("production");
  production.sources.backups = { complete: true, failures: 1 };
  const dir = directory(t, [half("staging"), production]);
  const issues = [
    ...Object.entries(LIVE).map(([number, key]) => liveIssue(number, key)),
    // An identical marker from an untrusted author is ignored.
    { ...liveIssue(999, LIVE[646], "someone-else") },
  ];
  const runGh = fakeGh(issues);
  const summaryPath = join(dir, "summary.md");
  const result = await main(["--input-dir", dir, "--publish"], {
    env: { ...ENV, GITHUB_STEP_SUMMARY: summaryPath },
    runGh,
    now: NOW,
  });
  assert.equal(
    runGh.calls.some((args) => args[0] === "api" && args[1] === "user"),
    false
  );
  const closed = runGh.calls
    .filter((args) => args[0] === "issue" && args[1] === "close")
    .map((args) => args[2])
    .sort();
  assert.deepEqual(closed, ["644", "645", "646", "647", "648"]);
  assert.equal(
    runGh.calls.some((args) => args.includes("999")),
    false
  );
  const created = runGh.calls.filter(
    (args) => args[0] === "issue" && args[1] === "create"
  );
  assert.equal(created.length, 1);
  assert.equal(
    created[0][created[0].indexOf("--title") + 1],
    "production backups needs attention"
  );
  assert.equal(result.closed, 5);
  assert.equal(result.created, 1);
  assert.equal(result.healthy, true);
  const summary = readFileSync(summaryPath, "utf8");
  assert.match(summary, CLOSED_FIRST_LIVE_ISSUE);
  assert.equal(BOT_LOGIN, "github-actions[bot]");
});

function disabledMarker(environment) {
  return { version: 1, environment, observedAt: OBSERVED, disabled: true };
}

// A collect job whose collector crashed leaves the placeholder it wrote first.
function placeholder(environment) {
  return { version: 1, environment, observedAt: OBSERVED, sources: {} };
}

test("dry run and an all-disabled run change nothing", async (t) => {
  const empty = fakeGh([]);
  const disabled = directory(t, [
    disabledMarker("staging"),
    disabledMarker("production"),
  ]);
  const off = await main(["--input-dir", disabled, "--publish"], {
    env: ENV,
    runGh: empty,
    now: NOW,
  });
  assert.equal(off.published, false);
  assert.equal(off.healthy, true);
  assert.deepEqual(off.missing, []);
  assert.deepEqual(empty.calls, []);

  const runGh = fakeGh(
    Object.entries(LIVE).map(([number, key]) => liveIssue(number, key))
  );
  const dir = directory(t, [half("staging"), half("production")]);
  const result = await main(["--input-dir", dir], {
    env: ENV,
    runGh,
    now: NOW,
  });
  assert.equal(result.closed, 5);
  assert.ok(runGh.calls.every((args) => args[0] === "api"));
});

test("dead-man's switch: no report at all fails without touching issues", async (t) => {
  const runGh = fakeGh([]);
  const summaryPath = join(directory(t, []), "summary.md");
  const result = await main(
    [
      "--input-dir",
      directory(t, []),
      "--publish",
      "--collect-result",
      "failure",
    ],
    { env: { ...ENV, GITHUB_STEP_SUMMARY: summaryPath }, runGh, now: NOW }
  );
  assert.equal(result.published, false);
  assert.equal(result.healthy, false);
  assert.deepEqual(result.missing, ["staging", "production"]);
  assert.deepEqual(runGh.calls, []);
  assert.match(readFileSync(summaryPath, "utf8"), NO_COLLECTOR_PATTERN);
  // Only the selected environment is expected on a single-environment run.
  const single = await main(
    [
      "--input-dir",
      directory(t, [disabledMarker("staging")]),
      "--expect",
      "staging",
    ],
    { env: ENV, runGh, now: NOW }
  );
  assert.equal(single.healthy, true);
  assert.deepEqual(runGh.calls, []);
});

test("dead-man's switch: a missing or crashed collector publishes a gap and fails", async (t) => {
  const issues = Object.entries(LIVE).map(([number, key]) =>
    liveIssue(number, key)
  );
  for (const halves of [
    [half("staging")],
    [half("staging"), placeholder("production")],
  ]) {
    const runGh = fakeGh(issues);
    const result = await main(
      [
        "--input-dir",
        directory(t, halves),
        "--publish",
        "--collect-result",
        "failure",
      ],
      { env: ENV, runGh, now: NOW }
    );
    assert.equal(result.published, true);
    assert.equal(result.healthy, false);
    assert.equal(result.closed, 0);
    assert.equal(
      runGh.calls.some((args) => args[0] === "issue" && args[1] === "close"),
      false
    );
    // The live issues are rewritten as coverage gaps, never closed.
    assert.ok(result.updated > 0);
  }
});

test("--expect accepts only staging and production", () => {
  assert.deepEqual(parseExpected("staging"), ["staging"]);
  assert.deepEqual(parseExpected(), ["staging", "production"]);
  assert.throws(() => parseExpected("staging,dev"));
});

test("refuses to run outside the canonical repository", async (t) => {
  await assert.rejects(
    main(["--input-dir", directory(t, [])], {
      env: { ...ENV, GITHUB_REPOSITORY: "someone/fork" },
      runGh: fakeGh([]),
      now: NOW,
    })
  );
});
