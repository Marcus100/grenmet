import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQueue,
  checkResult,
  classify,
  render,
  run,
  sharedFailures,
} from "./pr-queue.mjs";

const run_ = (name, conclusion = "SUCCESS", status = "COMPLETED") => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
});
const status = (context, state) => ({
  __typename: "StatusContext",
  context,
  state,
});
const LABEL = [{ name: "factory-review" }];

function pr(overrides = {}) {
  return {
    number: 1,
    title: "fix: example",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    labels: LABEL,
    statusCheckRollup: [run_("CI Success")],
    ...overrides,
  };
}

test("check runs and commit statuses map to pass, fail, pending or skip", () => {
  assert.equal(checkResult(run_("a")), "pass");
  assert.equal(checkResult(run_("a", "FAILURE")), "fail");
  assert.equal(checkResult(run_("a", null, "IN_PROGRESS")), "pending");
  assert.equal(checkResult(run_("a", "SKIPPED")), "skip");
  assert.equal(checkResult(status("a", "SUCCESS")), "pass");
  assert.equal(checkResult(status("a", "PENDING")), "pending");
  assert.equal(checkResult(status("a", "FAILURE")), "fail");
});

test("a draft, a failing check and a stale branch each name who must act", () => {
  assert.equal(classify(pr({ isDraft: true })).state, "draft");
  const failing = classify(
    pr({ statusCheckRollup: [run_("Type Check", "FAILURE")] })
  );
  assert.deepEqual([failing.state, failing.needs], ["CI failing", "author"]);
  assert.equal(failing.detail, "Type Check");
  const behind = classify(pr({ mergeStateStatus: "BEHIND" }));
  assert.deepEqual([behind.state, behind.needs], ["behind dev", "author"]);
});

test("running CI waits on nobody; a missing label is the author's job", () => {
  const running = classify(
    pr({ statusCheckRollup: [run_("CI Success", null, "IN_PROGRESS")] })
  );
  assert.deepEqual([running.state, running.needs], ["CI running", "nobody"]);
  const unlabelled = classify(pr({ labels: [] }));
  assert.deepEqual(
    [unlabelled.state, unlabelled.needs],
    ["needs review label", "author"]
  );
});

test("review statuses decide: waiting, in review, failed, ready", () => {
  const withFactory = (...extra) =>
    pr({ statusCheckRollup: [run_("CI Success"), ...extra] });
  assert.equal(classify(withFactory()).state, "waiting for review");
  assert.equal(
    classify(withFactory(status("Factory review", "PENDING"))).state,
    "in review"
  );
  const failed = classify(withFactory(status("Factory review", "FAILURE")));
  assert.deepEqual([failed.state, failed.needs], ["review failed", "author"]);
  const both = [
    status("Factory review", "SUCCESS"),
    status("Factory security review", "SUCCESS"),
  ];
  const ready = classify(withFactory(...both));
  assert.deepEqual([ready.state, ready.needs], ["reviewed, ready", "worker"]);
  const owner = classify({ ...withFactory(...both), title: "x (OWNER-MERGE)" });
  assert.equal(owner.needs, "owner");
});

test("a check failing on several PRs is a repo-wide blocker, not each author's", () => {
  const broken = () =>
    pr({ statusCheckRollup: [run_("Rulesets match snapshot", "FAILURE")] });
  const prs = [1, 2, 3].map((number) => ({ ...broken(), number }));
  assert.deepEqual([...sharedFailures(prs)], ["Rulesets match snapshot"]);
  const queue = buildQueue(prs);
  assert.ok(queue.rows.every((r) => r.state !== "CI failing"));
  assert.deepEqual(queue.shared, ["Rulesets match snapshot"]);
});

test("owner items sort first and the footer says what needs you", () => {
  const ready = {
    ...pr({
      number: 7,
      title: "x (OWNER-MERGE)",
      statusCheckRollup: [
        run_("CI Success"),
        status("Factory review", "SUCCESS"),
        status("Factory security review", "SUCCESS"),
      ],
    }),
  };
  const queue = buildQueue([pr({ number: 2, labels: [] }), ready]);
  assert.equal(queue.rows[0].number, 7);
  assert.ok(render(queue).trim().endsWith("Needs you: #7"));
  assert.ok(
    render(buildQueue([pr()]))
      .trim()
      .endsWith("Needs you: nothing")
  );
});

test("run prints the table, or JSON with --json, from whatever gh returns", () => {
  const lines = [];
  assert.equal(
    run(
      [],
      () => [pr()],
      (line) => lines.push(line)
    ),
    0
  );
  assert.ok(lines[0].includes("waiting for review"));
  const json = [];
  run(
    ["--json"],
    () => [pr()],
    (line) => json.push(line)
  );
  assert.equal(JSON.parse(json[0]).rows[0].number, 1);
});
