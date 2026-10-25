import assert from "node:assert/strict";
import test from "node:test";
import { createReviewReceipt } from "./review-receipt.mjs";
import {
  CONTEXTS,
  ciBlockers,
  eligible,
  processPull,
  reviewPaths,
  securityRequired,
  statusMatches,
} from "./review-worker.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const REPO = { full_name: "Marcus100/grenmet" };
const PR = {
  number: 588,
  state: "open",
  draft: false,
  head: { sha: HEAD, ref: "factory/example", repo: REPO },
  base: { sha: BASE, ref: "dev", repo: REPO },
};
const CI = ["CI Success", "Build Web Apps"];
const CHECKS = CI.map((name) => ({
  name,
  status: "COMPLETED",
  conclusion: "SUCCESS",
}));
const CLEAN = {
  status: "completed",
  verdict: "approve",
  summary: "Reviewed the full diff.",
  findings: [],
};

function fake({
  files = ["docs/example.md"],
  code = 0,
  result = CLEAN,
  checks = CHECKS,
  changed = false,
} = {}) {
  const calls = [];
  const statuses = [];
  let pulls = 0;
  const api = {
    login: () => "reviewer",
    pull: () => {
      pulls++;
      return changed && pulls > 1
        ? { ...PR, base: { ...PR.base, sha: "c".repeat(40) } }
        : PR;
    },
    files: () => files,
    checks: () => checks,
    statuses: () => statuses,
    claim: () => {
      calls.push("claim");
      return { claimed: true };
    },
    release: () => {
      calls.push("release");
      return { released: true };
    },
    prepare: () => BASE,
    review: (number, kind, info) => {
      assert.equal(number, PR.number);
      calls.push(`review:${kind}`);
      return { code, receipt: createReviewReceipt(info, result) };
    },
    publish: (head, context, state, description) => {
      assert.equal(head, HEAD);
      calls.push(`publish:${context}:${state}`);
      statuses.unshift({
        context,
        state,
        description,
        creator: { login: "reviewer" },
      });
    },
    merge: (number, head) => {
      assert.equal(number, 588);
      assert.equal(head, HEAD);
      calls.push("merge");
    },
  };
  return { api, calls, statuses };
}

test("only same-repository open dev PRs are eligible; drafts require explicit selection", () => {
  assert.equal(eligible(PR), true);
  for (const pr of [
    { ...PR, draft: true },
    { ...PR, state: "closed" },
    { ...PR, base: { ...PR.base, ref: "staging" } },
    { ...PR, head: { ...PR.head, repo: { full_name: "external/grenmet" } } },
  ])
    assert.equal(eligible(pr), false);
  assert.equal(eligible({ ...PR, draft: true }, true), true);
});

test("missing, pending, failed or skipped required CI blocks review", () => {
  for (const checks of [
    [],
    [{ name: "CI Success", status: "IN_PROGRESS" }],
    CHECKS.map((check) => ({ ...check, conclusion: "FAILURE" })),
    CHECKS.map((check) => ({ ...check, conclusion: "SKIPPED" })),
  ])
    assert.ok(ciBlockers(checks, CI).length);
  assert.deepEqual(ciBlockers(CHECKS, CI), []);
  const { api, calls } = fake({ checks: [] });
  assert.equal(processPull(588, {}, api, CI).outcome, "waiting");
  assert.deepEqual(calls, []);
});

test("ordinary work gets one independent review and can merge the pinned head", () => {
  const { api, calls } = fake();
  assert.equal(processPull(588, { merge: true }, api, CI).outcome, "merged");
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 1);
  assert.ok(calls.includes("merge"));
  assert.equal(calls.at(-1), "release");
});

test("factory controls and high-risk application changes require a security review", () => {
  for (const file of [
    ".claude/hooks/example.mjs",
    "AGENTS.md",
    "scripts/agents/worker.mjs",
    "scripts/ci/ai-review.mjs",
    "scripts/production/deploy.py",
    "apps/api/fastapi/src/auth/service.py",
  ]) {
    assert.equal(securityRequired([file]), true);
  }
  const { api, calls } = fake({ files: ["scripts/agents/worker.mjs"] });
  processPull(588, { merge: true }, api, CI);
  assert.ok(calls.includes("review:code"));
  assert.ok(calls.includes("review:security"));
});

test("renaming a sensitive file cannot erase the security-review requirement", () => {
  const files = reviewPaths([
    {
      filename: "docs/example.md",
      previous_filename: "apps/api/fastapi/src/auth/service.py",
    },
  ]);
  assert.deepEqual(files, [
    "docs/example.md",
    "apps/api/fastapi/src/auth/service.py",
  ]);
  assert.equal(securityRequired(files), true);
});

test("review failure, incompletion, missing receipt or changed base cannot approve or merge", () => {
  for (const options of [
    { code: 1 },
    { result: { ...CLEAN, status: "incomplete" } },
    { result: { ...CLEAN, verdict: "changes_requested" } },
    { changed: true },
  ]) {
    const { api, calls, statuses } = fake(options);
    assert.throws(() => processPull(588, { merge: true }, api, CI));
    assert.ok(!calls.includes("merge"));
    assert.equal(statuses[0].state, "failure");
    assert.equal(calls.at(-1), "release");
  }
});

test("unintegrated base, another owner's claim and dry-run make no model calls", () => {
  const { api, calls } = fake();
  assert.equal(processPull(588, { dryRun: true }, api, CI).outcome, "ready");
  assert.deepEqual(calls, []);
  api.claim = () => ({ claimed: false });
  assert.equal(processPull(588, {}, api, CI).outcome, "waiting");
  api.claim = () => ({ claimed: true });
  api.prepare = () => "c".repeat(40);
  assert.throws(() => processPull(588, {}, api, CI));
  assert.ok(!calls.some((call) => call.startsWith("review:")));
});

test("a cached success must come from the trusted issuer and exact base; latest failure wins", () => {
  const { api, calls, statuses } = fake();
  processPull(588, {}, api, CI);
  processPull(588, {}, api, CI);
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 1);
  assert.equal(
    statusMatches(statuses, CONTEXTS.code, BASE, "code", "someone-else"),
    false
  );
  assert.equal(
    statusMatches(statuses, CONTEXTS.code, "c".repeat(40), "code", "reviewer"),
    false
  );
  statuses.unshift({
    ...statuses.find((status) => status.context === CONTEXTS.code),
    state: "failure",
  });
  assert.equal(
    statusMatches(statuses, CONTEXTS.code, BASE, "code", "reviewer"),
    false
  );
});

test("explicit draft review publishes evidence but never merges the draft", () => {
  const { api, calls } = fake();
  api.pull = () => ({ ...PR, draft: true });
  assert.equal(
    processPull(588, { includeDraft: true, merge: true }, api, CI).outcome,
    "reviewed"
  );
  assert.ok(!calls.includes("merge"));
});

test("failed revisions do not spend allowance on automatic repeated reviews", () => {
  const { api, calls } = fake({ code: 1 });
  assert.throws(() => processPull(588, {}, api, CI));
  assert.equal(processPull(588, {}, api, CI).outcome, "waiting");
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 1);
  assert.throws(() => processPull(588, { retry: true }, api, CI));
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 2);
});

test("a successful explicit retry supersedes failure for later automatic merging", () => {
  const { api, calls } = fake({ code: 1 });
  assert.throws(() => processPull(588, {}, api, CI));
  api.review = (_number, kind, info) => {
    calls.push(`review:${kind}`);
    return { code: 0, receipt: createReviewReceipt(info, CLEAN) };
  };
  assert.equal(processPull(588, { retry: true }, api, CI).outcome, "reviewed");
  assert.equal(processPull(588, { merge: true }, api, CI).outcome, "merged");
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 2);
});
