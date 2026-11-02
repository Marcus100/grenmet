import assert from "node:assert/strict";
import test from "node:test";
import { publishObservations as publish } from "./audit-report.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const FIXED_NOW = new Date("2026-10-25T12:00:00.000Z");
const actorLogin = "audit-bot";
const generatedHeader = "## Advisory audit observation";
const MARKER_PATTERN = /<!-- codex-audit:[a-f0-9]+ -->/u;
const EVIDENCE_COMMAND_PATTERN =
  /Evidence command: `pnpm audit:advisories --check freshness`/u;
const SANITIZED_LEAK_PATTERN =
  /ghp_abcdefghijklmnopqrstuvwxyz1234567890|secret=abc|Bearer abcdefghijklmnop|\/home\/eugine/u;
const REPO_RELATIVE_COMMAND_PATTERN = /pnpm --dir apps\/web\/gms test/u;
const PUBLIC_GITHUB_RUN_PATTERN =
  /https:\/\/github\.com\/Marcus100\/grenmet\/actions\/runs\/77/u;
const EMAIL_AND_SECRET_LEAK_PATTERN =
  /private\.user@example\.test|visible-secret-value|hunter2|token=abc123/u;
const REDACTED_EMAIL_PATTERN = /\[redacted email\]/u;
const REDACTED_API_KEY_PATTERN = /api-key=\[redacted\]/u;
const REPO_VALIDATION_PATTERN = /repo/u;
const COMMIT_VALIDATION_PATTERN = /commit/u;
const STATUS_VALIDATION_PATTERN = /status/u;
const MAX_NEW_ISSUES_PATTERN = /maxNewIssues/u;
const LOGIN_VALIDATION_PATTERN = /authenticated GitHub identity/u;
const OBSERVED_TIMESTAMP_PATTERN = /- Observed: `2026-10-25T00:00:00\.000Z`/u;
const observation = (overrides = {}) => ({
  key: "check:advisory-42",
  title: "Advisory source freshness",
  status: "fail",
  severity: "high",
  owner: "Claude",
  command: "pnpm audit:advisories --check freshness",
  summary: "The structured freshness check found an outdated source.",
  ...overrides,
});
const publishObservations = (options) =>
  publish({ now: FIXED_NOW, ...options });

function githubMock(initial = []) {
  const issues = structuredClone(initial);
  const calls = [];
  const runGh = (args) => {
    calls.push(args);
    if (args[0] === "api" && args[1] === "user") return { login: actorLogin };
    if (args[0] === "api")
      return [issues.filter((item) => !item.isPullRequest)];
    if (args[0] === "label" && args[1] === "list")
      return [{ name: "codex-audit" }];
    if (args[0] === "issue" && args[1] === "create") {
      const issue = {
        number: issues.length + 1,
        state: "open",
        user: { login: actorLogin },
        title: args[args.indexOf("--title") + 1],
        body: args[args.indexOf("--body") + 1],
      };
      issues.push(issue);
      return "https://github.com/Marcus100/grenmet/issues/1";
    }
    if (args[0] === "issue" && args[1] === "edit") {
      const issue = issues.find((item) => item.number === Number(args[2]));
      if (args.includes("--title"))
        issue.title = args[args.indexOf("--title") + 1];
      if (args.includes("--body"))
        issue.body = args[args.indexOf("--body") + 1];
      return "edited";
    }
    if (args[0] === "issue" && args[1] === "reopen") {
      issues.find((item) => item.number === Number(args[2])).state = "open";
      return "reopened";
    }
    if (args[0] === "issue" && args[1] === "close") {
      issues.find((item) => item.number === Number(args[2])).state = "closed";
      return "closed";
    }
    if (args[0] === "label" && args[1] === "create") return "created";
    throw new Error(`Unexpected gh args: ${args.join(" ")}`);
  };
  return { calls, issues, runGh };
}

const markerFor = (body) => body.match(MARKER_PATTERN)?.[0];
const listCall = (calls) =>
  calls.find((args) => args[0] === "api" && args[1] === "--paginate");

test("creates one labeled, safe issue for a failing observation", async () => {
  const { calls, issues, runGh } = githubMock();
  const result = await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
    now: new Date("2026-10-25T00:00:00Z"),
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].state, "open");
  assert.match(issues[0].body, EVIDENCE_COMMAND_PATTERN);
  assert.match(issues[0].body, OBSERVED_TIMESTAMP_PATTERN);
  assert.match(issues[0].body, new RegExp(commit, "u"));
  assert.ok(markerFor(issues[0].body));
  assert.equal(result.created.length, 1);
  assert.ok(listCall(calls).includes("--paginate"));
  const labelList = calls.find(
    (args) => args[0] === "label" && args[1] === "list"
  );
  assert.ok(labelList);
  assert.equal(labelList[labelList.indexOf("--limit") + 1], "1000");
});

test("updates a matching issue in place instead of duplicating it", async () => {
  const { issues, runGh } = githubMock();
  await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  const marker = markerFor(issues[0].body);
  const {
    issues: existing,
    calls: updateCalls,
    runGh: updateGh,
  } = githubMock([
    {
      number: 19,
      state: "open",
      title: "Old title",
      user: { login: actorLogin },
      body: `${generatedHeader}\n\nold\n${marker}`,
    },
  ]);
  const result = await publishObservations({
    observations: [
      observation({
        title: "Updated freshness check",
        summary: "Still stale.",
      }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh: updateGh,
  });
  assert.equal(existing.length, 1);
  assert.equal(existing[0].number, 19);
  assert.equal(existing[0].title, "Updated freshness check");
  assert.equal(result.updated.length, 1);
  assert.ok(
    updateCalls.some((args) => args[0] === "issue" && args[1] === "edit")
  );
});

test("reopens a closed matching issue when the failure recurs", async () => {
  const { issues: seeded, runGh: seedGh } = githubMock();
  await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh: seedGh,
  });
  const marker = markerFor(seeded[0].body);
  const { issues, calls, runGh } = githubMock([
    {
      number: 8,
      state: "closed",
      title: "Old title",
      user: { login: actorLogin },
      body: `${generatedHeader}\n\nclosed\n${marker}`,
    },
  ]);
  await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.equal(issues[0].state, "open");
  assert.ok(calls.some((args) => args[0] === "issue" && args[1] === "reopen"));
});

test("closes only a previously tracked issue whose observation passes", async () => {
  const { issues: seeded, runGh: seedGh } = githubMock();
  await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh: seedGh,
  });
  const marker = markerFor(seeded[0].body);
  const { issues, calls, runGh } = githubMock([
    {
      number: 5,
      state: "open",
      title: "Tracked",
      user: { login: actorLogin },
      body: `${generatedHeader}\n\ntracked\n${marker}`,
    },
    { number: 6, state: "open", title: "Unrelated", body: "ordinary issue" },
  ]);
  await publishObservations({
    observations: [observation({ status: "pass" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.equal(issues[0].state, "closed");
  assert.equal(issues[1].state, "open");
  assert.deepEqual(
    calls
      .filter((args) => args[0] === "issue" && args[1] === "close")
      .map((args) => args[2]),
    ["5"]
  );
});

test("unknown observations never close tracked findings", async () => {
  const { issues: seeded, runGh: seedGh } = githubMock();
  await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh: seedGh,
  });
  const marker = markerFor(seeded[0].body);
  const { issues, calls, runGh } = githubMock([
    {
      number: 5,
      state: "open",
      title: "Tracked",
      user: { login: actorLogin },
      body: `${generatedHeader}\n\ntracked\n${marker}`,
    },
  ]);
  const result = await publishObservations({
    observations: [observation({ status: "unknown" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.equal(issues[0].state, "open");
  assert.equal(
    calls.some((args) => args[0] === "issue" && args[1] === "close"),
    false
  );
  assert.equal(result.unchanged.length, 1);
});

test("unknown observations without a prior finding do not create issues", async () => {
  const { calls, issues, runGh } = githubMock();
  const result = await publishObservations({
    observations: [observation({ status: "unknown" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.equal(issues.length, 0);
  assert.equal(
    calls.some((args) => args[0] === "issue" || args[0] === "label"),
    false
  );
  assert.equal(result.unchanged.length, 1);
});

test("forged public markers from another author are never updated or closed", async () => {
  const seeded = githubMock();
  await publishObservations({
    observations: [observation({ key: "security:forged" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh: seeded.runGh,
  });
  const marker = markerFor(seeded.issues[0].body);
  const foreign = {
    number: 30,
    state: "open",
    title: "Attacker issue",
    user: { login: "attacker" },
    body: `${generatedHeader}\n\nForged finding.\n\n${marker}`,
  };
  const malformed = {
    number: 31,
    state: "open",
    title: "Manual issue missing generated header",
    user: { login: actorLogin },
    body: `Owner note before header.\n${generatedHeader}\n\n${marker}`,
  };
  const { calls, issues, runGh } = githubMock([foreign, malformed]);
  const failure = observation({
    key: "security:forged",
    title: "Canonical audit finding",
  });
  const created = await publishObservations({
    observations: [failure],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.equal(created.created.length, 1);
  assert.equal(issues[0].title, "Attacker issue");
  assert.equal(issues[0].body, foreign.body);
  assert.equal(issues[0].state, "open");
  assert.equal(issues[1].title, "Manual issue missing generated header");
  assert.equal(issues[1].body, malformed.body);
  assert.equal(issues[1].state, "open");
  assert.equal(issues[2].user.login, actorLogin);
  assert.equal(issues[2].body.split("\n").includes(marker), true);
  assert.equal(
    calls.some((args) => args[0] === "issue" && args[1] === "edit"),
    false
  );

  const passed = await publishObservations({
    observations: [observation({ key: "security:forged", status: "pass" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.deepEqual(
    passed.closed.map((item) => item.issueNumber),
    [3]
  );
  assert.equal(issues[0].state, "open");
  assert.equal(issues[1].state, "open");
  assert.equal(issues[2].state, "closed");
  assert.deepEqual(
    calls
      .filter((args) => args[0] === "issue" && args[1] === "close")
      .map((args) => args[2]),
    ["3"]
  );
});

test("does not inspect or mutate issues if the authenticated GitHub user is unknown", async () => {
  const calls = [];
  const runGh = (args) => {
    calls.push(args);
    return { login: "" };
  };
  await assert.rejects(
    () =>
      publishObservations({
        observations: [observation()],
        repo: "Marcus100/grenmet",
        commit,
        runGh,
      }),
    LOGIN_VALIDATION_PATTERN
  );
  assert.deepEqual(calls, [["api", "user"]]);
});

test("older reports cannot overwrite or close a newer finding", async () => {
  const { calls, issues, runGh } = githubMock();
  await publishObservations({
    observations: [observation({ key: "check:timestamp-order" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  const newerNow = new Date(FIXED_NOW.getTime() + 3_600_000);
  await publishObservations({
    observations: [
      observation({
        key: "check:timestamp-order",
        title: "Newer finding",
        summary: "Newer scheduled result.",
      }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
    nowISO: newerNow.toISOString(),
  });
  const newerBody = issues[0].body;
  const start = calls.length;

  const staleFailure = await publishObservations({
    observations: [
      observation({
        key: "check:timestamp-order",
        title: "Outdated finding",
        summary: "An older run completed later.",
      }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
    now: FIXED_NOW,
  });
  const stalePass = await publishObservations({
    observations: [
      observation({ key: "check:timestamp-order", status: "pass" }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
    now: FIXED_NOW,
  });

  assert.equal(staleFailure.unchanged.length, 1);
  assert.equal(stalePass.closed.length, 0);
  assert.equal(stalePass.unchanged.length, 1);
  assert.equal(issues[0].state, "open");
  assert.equal(issues[0].title, "Newer finding");
  assert.equal(issues[0].body, newerBody);
  assert.equal(
    calls
      .slice(start)
      .some(
        (args) => args[0] === "issue" && ["edit", "close"].includes(args[1])
      ),
    false
  );
});

test("unchanged evidence causes no issue mutation", async () => {
  const { issues, runGh } = githubMock();
  await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  const stored = structuredClone(issues);
  const { calls, runGh: secondGh } = githubMock(stored);
  const result = await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh: secondGh,
  });
  assert.equal(
    calls.some((args) => args[0] === "issue"),
    false
  );
  assert.equal(result.unchanged.length, 1);
});

test("dry run reports planned changes without creating labels or issues", async () => {
  const { calls, issues, runGh } = githubMock();
  const result = await publishObservations({
    observations: [observation()],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
    dryRun: true,
  });
  assert.equal(issues.length, 0);
  assert.equal(
    calls.some((args) => args[0] === "issue" || args[0] === "label"),
    false
  );
  assert.equal(result.created.length, 1);
});

test("caps new issues by severity while processing existing updates and closures", async () => {
  const seeded = githubMock();
  await publishObservations({
    observations: [observation({ key: "existing:update" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh: seeded.runGh,
  });
  await publishObservations({
    observations: [observation({ key: "existing:resolved" })],
    repo: "Marcus100/grenmet",
    commit,
    runGh: seeded.runGh,
  });

  const { calls, issues, runGh } = githubMock(seeded.issues);
  const result = await publishObservations({
    observations: [
      observation({
        key: "existing:update",
        title: "Updated existing finding",
        summary: "Evidence changed for the existing issue.",
      }),
      observation({ key: "existing:resolved", status: "pass" }),
      observation({ key: "new:low", severity: "low" }),
      observation({ key: "new:high", severity: "high" }),
      observation({ key: "new:blocker", severity: "blocker" }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
    maxNewIssues: 2,
  });

  assert.deepEqual(
    result.created.map((item) => item.key),
    ["new:high", "new:blocker"]
  );
  assert.deepEqual(
    result.deferred.map((item) => item.key),
    ["new:low"]
  );
  assert.equal(result.updated.length, 2);
  assert.equal(result.closed.length, 1);
  assert.equal(
    issues.find((issue) => issue.number === result.closed[0].issueNumber)
      ?.state,
    "closed"
  );
  assert.equal(
    calls.some((args) => args[0] === "issue" && args[1] === "edit"),
    true
  );
  assert.equal(
    calls.some((args) => args[0] === "issue" && args[1] === "close"),
    true
  );
});

test("dry-run applies the same new-issue cap and returns safe deferred observations", async () => {
  const { calls, issues, runGh } = githubMock();
  const result = await publishObservations({
    observations: [
      observation({ key: "deferred:low", severity: "low" }),
      observation({ key: "selected:blocker", severity: "blocker" }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
    dryRun: true,
    maxNewIssues: 1,
  });
  assert.equal(issues.length, 0);
  assert.equal(
    calls.some((args) => args[0] === "issue" || args[0] === "label"),
    false
  );
  assert.deepEqual(
    result.created.map((item) => item.key),
    ["selected:blocker"]
  );
  assert.deepEqual(
    result.deferred.map((item) => item.key),
    ["deferred:low"]
  );
  assert.equal(
    result.deferred[0].summary,
    observation({ key: "deferred:low" }).summary
  );
});

test("sanitizes suspicious command and summary content before publication", async () => {
  const { issues, runGh } = githubMock();
  await publishObservations({
    observations: [
      observation({
        command:
          "check --token ghp_abcdefghijklmnopqrstuvwxyz1234567890 https://example.test/path?secret=abc",
        summary:
          "Bearer abcdefghijklmnop /home/eugine/private/input.txt?key=secret",
      }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.doesNotMatch(issues[0].body, SANITIZED_LEAK_PATTERN);
});

test("preserves safe repository-relative commands and public audit run links", async () => {
  const { issues, runGh } = githubMock();
  await publishObservations({
    observations: [
      observation({
        command: "pnpm --dir apps/web/gms test",
        summary:
          "Evidence: https://github.com/Marcus100/grenmet/actions/runs/77",
      }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.match(issues[0].body, REPO_RELATIVE_COMMAND_PATTERN);
  assert.match(issues[0].body, PUBLIC_GITHUB_RUN_PATTERN);
});

test("redacts email addresses and secret assignments", async () => {
  const { issues, runGh } = githubMock();
  await publishObservations({
    observations: [
      observation({
        command: "check --api-key=visible-secret-value",
        summary:
          "Contact private.user@example.test; password=hunter2 and token=abc123.",
      }),
    ],
    repo: "Marcus100/grenmet",
    commit,
    runGh,
  });
  assert.doesNotMatch(issues[0].body, EMAIL_AND_SECRET_LEAK_PATTERN);
  assert.match(issues[0].body, REDACTED_EMAIL_PATTERN);
  assert.match(issues[0].body, REDACTED_API_KEY_PATTERN);
});

test("rejects invalid repository, commit, and observation values before GitHub access", async () => {
  const { calls, runGh } = githubMock();
  await assert.rejects(
    () =>
      publishObservations({
        observations: [],
        repo: "other/repo",
        commit,
        runGh,
      }),
    REPO_VALIDATION_PATTERN
  );
  await assert.rejects(
    () =>
      publishObservations({
        observations: [observation()],
        repo: "Marcus100/grenmet",
        commit: "not-a-sha",
        runGh,
      }),
    COMMIT_VALIDATION_PATTERN
  );
  await assert.rejects(
    () =>
      publishObservations({
        observations: [observation({ status: "maybe" })],
        repo: "Marcus100/grenmet",
        commit,
        runGh,
      }),
    STATUS_VALIDATION_PATTERN
  );
  await assert.rejects(
    () =>
      publishObservations({
        observations: [],
        repo: "Marcus100/grenmet",
        commit,
        runGh,
        maxNewIssues: 51,
      }),
    MAX_NEW_ISSUES_PATTERN
  );
  assert.equal(calls.length, 0);
});
