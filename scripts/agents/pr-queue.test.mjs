import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildQueue,
  checkResult,
  classify,
  render,
  requiredContexts,
  run,
  statusIssuers,
  TRUSTED_STATUS_LOGIN,
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
    files: [{ path: "apps/web/gms/src/example.ts" }],
    changedFiles: 1,
    statusCheckRollup: [run_("CI Success")],
    factoryIssuers: {
      "Factory review": TRUSTED_STATUS_LOGIN,
      "Factory security review": TRUSTED_STATUS_LOGIN,
    },
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

test("spoofed pending and failed Factory statuses never decide who must fix a PR", () => {
  for (const state of ["PENDING", "FAILURE"]) {
    const result = classify(
      pr({
        factoryIssuers: { "Factory review": "intruder" },
        statusCheckRollup: [
          run_("CI Success"),
          status("Factory review", state),
        ],
      })
    );
    assert.equal(result.state, "review not verified");
  }
});

test("owner routing uses complete changed files even without a title marker", () => {
  const statusCheckRollup = [
    run_("CI Success"),
    status("Factory review", "SUCCESS"),
    status("Factory security review", "SUCCESS"),
  ];
  for (const path of [
    "package.json",
    ".github/workflows/check.yml",
    ".husky/pre-push",
    "apps/api/fastapi/src/auth/permissions.py",
  ]) {
    const result = classify(pr({ files: [{ path }], statusCheckRollup }));
    assert.deepEqual(
      [result.state, result.needs],
      ["reviewed, ready", "owner"]
    );
  }
  for (const files of [undefined, [], [{ path: "apps/web/gms/src/a.ts" }]]) {
    const result = classify(pr({ files, changedFiles: 2, statusCheckRollup }));
    assert.deepEqual(
      [result.state, result.needs],
      ["ownership unknown", "owner"]
    );
  }
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

test("a merge conflict is the author's job even when reviews passed", () => {
  const conflicted = classify({
    ...pr({
      statusCheckRollup: [
        run_("CI Success"),
        status("Factory review", "SUCCESS"),
        status("Factory security review", "SUCCESS"),
      ],
    }),
    mergeStateStatus: "DIRTY",
  });
  assert.deepEqual(
    [conflicted.state, conflicted.needs],
    ["merge conflict", "author"]
  );
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
      (line) => lines.push(line),
      null
    ),
    0
  );
  assert.ok(lines[0].includes("waiting for review"));
  const json = [];
  run(
    ["--json"],
    () => [pr()],
    (line) => json.push(line),
    null
  );
  assert.equal(JSON.parse(json[0]).rows[0].number, 1);
});

test("a failing check the ruleset does not require is advisory, not a blocker", () => {
  const required = new Set(["CI Success"]);
  const reviewed = (number) =>
    pr({
      number,
      statusCheckRollup: [
        run_("CI Success"),
        run_("Rulesets match snapshot", "FAILURE"),
        status("Factory review", "SUCCESS"),
        status("Factory security review", "SUCCESS"),
      ],
    });
  const queue = buildQueue([1, 2, 3].map(reviewed), required);
  assert.deepEqual(queue.shared, []);
  for (const r of queue.rows) {
    assert.deepEqual([r.state, r.needs], ["reviewed, ready", "worker"]);
    assert.ok(
      r.detail.includes("non-required failing: Rulesets match snapshot")
    );
  }
  // The same failure on a required check still blocks.
  const blocked = classify(
    pr({ statusCheckRollup: [run_("CI Success", "FAILURE")] }),
    new Set(),
    required
  );
  assert.equal(blocked.state, "CI failing");
});

test("required checks come from Protect dev, falling back to Protect staging", () => {
  const dir = mkdtempSync(join(tmpdir(), "pr-queue-"));
  const write = (rulesets) => {
    const path = join(dir, "rulesets.json");
    writeFileSync(path, JSON.stringify(rulesets));
    return path;
  };
  const rule = (name, ...contexts) => ({
    name,
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: contexts.map((context) => ({ context })),
        },
      },
    ],
  });
  assert.deepEqual(
    [...requiredContexts(write([rule("Protect staging", "A")]))],
    ["A"]
  );
  assert.deepEqual(
    [
      ...requiredContexts(
        write([rule("Protect staging", "A"), rule("Protect dev", "B", "C")])
      ),
    ],
    ["B", "C"]
  );
  assert.equal(requiredContexts(join(dir, "missing.json")), null);
});

test("a required check that has not reported keeps the PR out of 'ready'", () => {
  const required = new Set(["CI Success", "Type Check", "Factory review"]);
  const reviewed = pr({
    mergeStateStatus: "BLOCKED",
    statusCheckRollup: [
      run_("CI Success"),
      status("Factory review", "SUCCESS"),
      status("Factory security review", "SUCCESS"),
    ],
  });
  const result = classify(reviewed, new Set(), required);
  assert.deepEqual([result.state, result.needs], ["CI running", "nobody"]);
  const complete = classify(
    {
      ...reviewed,
      statusCheckRollup: [...reviewed.statusCheckRollup, run_("Type Check")],
    },
    new Set(),
    required
  );
  assert.equal(complete.state, "reviewed, ready");
});

test("promotion PRs are the owner's to merge, whatever their title says", () => {
  for (const base of ["staging", "main"]) {
    const promotion = classify(
      pr({
        title: `Promote dev to ${base}`,
        baseRefName: base,
        labels: [],
        statusCheckRollup: [
          run_("CI Success"),
          status("Factory review", "SUCCESS"),
          status("Factory security review", "SUCCESS"),
        ],
      })
    );
    assert.deepEqual(
      [promotion.state, promotion.needs],
      ["promotion ready", "owner"],
      base
    );
    assert.ok(promotion.detail.includes(base));
  }
  const toDev = classify(pr({ baseRefName: "dev" }));
  assert.notEqual(toDev.needs, "owner");
});

test("independent failures on several PRs stay with each author", () => {
  const required = new Set(["Type Check", "CI Success"]);
  const failing = (number) =>
    pr({
      number,
      statusCheckRollup: [
        run_("Type Check", "FAILURE"),
        run_("CI Success", "FAILURE"),
        status("Factory review", "SUCCESS"),
        status("Factory security review", "SUCCESS"),
      ],
    });
  const queue = buildQueue([1, 2, 3].map(failing), required);
  for (const r of queue.rows) {
    assert.deepEqual([r.state, r.needs], ["CI failing", "author"]);
    assert.ok(r.detail.includes("Type Check (also on 3+ PRs)"));
  }
  assert.deepEqual(queue.shared.sort(), ["CI Success", "Type Check"]);
});

test("a PR with a failing required check is never ready, shared or not", () => {
  const reviewed = (number, base) =>
    pr({
      number,
      baseRefName: base,
      statusCheckRollup: [
        run_("CI Success", "FAILURE"),
        status("Factory review", "SUCCESS"),
        status("Factory security review", "SUCCESS"),
      ],
    });
  const required = new Set(["CI Success"]);
  for (const base of ["dev", "staging", "main"]) {
    const queue = buildQueue(
      [1, 2, 3].map((n) => reviewed(n, base)),
      required
    );
    for (const r of queue.rows)
      assert.deepEqual([r.state, r.needs], ["CI failing", "author"], base);
    assert.ok(render(queue).trim().endsWith("Needs you: nothing"));
  }
});

test("a passing Factory status from anyone but the review App is not trusted", () => {
  const both = [
    status("Factory review", "SUCCESS"),
    status("Factory security review", "SUCCESS"),
  ];
  const forged = classify(
    pr({
      statusCheckRollup: [run_("CI Success"), ...both],
      factoryIssuers: {
        "Factory review": "someone-else",
        "Factory security review": TRUSTED_STATUS_LOGIN,
      },
    })
  );
  assert.deepEqual(
    [forged.state, forged.needs],
    ["review not verified", "owner"]
  );
  assert.ok(forged.detail.includes("do not merge on it"));
  // Unknown issuers (not fetched) are never trusted either.
  const unknown = classify(
    pr({
      statusCheckRollup: [run_("CI Success"), ...both],
      factoryIssuers: undefined,
    })
  );
  assert.equal(unknown.state, "review not verified");
});

test("the newest status per context decides who created it", () => {
  assert.deepEqual(
    statusIssuers([
      { context: "Factory review", creator: { login: TRUSTED_STATUS_LOGIN } },
      { context: "Factory review", creator: { login: "old-user" } },
      { context: "Factory security review", creator: null },
    ]),
    { "Factory review": TRUSTED_STATUS_LOGIN, "Factory security review": "" }
  );
});

test("run looks up who created the Factory statuses of each PR", () => {
  const out = [];
  const calls = [];
  const rows = [
    pr({
      number: 7,
      headRefOid: "abc123",
      factoryIssuers: undefined,
      statusCheckRollup: [
        run_("CI Success"),
        status("Factory review", "SUCCESS"),
        status("Factory security review", "SUCCESS"),
      ],
    }),
  ];
  run(
    ["--json"],
    () => rows,
    (text) => out.push(text),
    null,
    (repo, sha) => {
      calls.push([repo, sha]);
      return [
        {
          context: "Factory review",
          state: "success",
          creator: { login: TRUSTED_STATUS_LOGIN },
        },
        {
          context: "Factory security review",
          state: "success",
          creator: { login: "intruder" },
        },
      ];
    }
  );
  assert.deepEqual(calls, [["Marcus100/grenmet", "abc123"]]);
  assert.equal(JSON.parse(out[0]).rows[0].state, "review not verified");
});

test("run uses the same newest snapshot for status state and issuer", () => {
  const out = [];
  run(
    ["--json"],
    () => [
      pr({
        headRefOid: "abc123",
        statusCheckRollup: [
          run_("CI Success"),
          status("Factory review", "SUCCESS"),
          status("Factory security review", "SUCCESS"),
        ],
      }),
    ],
    (text) => out.push(text),
    null,
    () => [
      {
        context: "Factory review",
        state: "failure",
        creator: { login: TRUSTED_STATUS_LOGIN },
      },
      {
        context: "Factory review",
        state: "success",
        creator: { login: TRUSTED_STATUS_LOGIN },
      },
      {
        context: "Factory security review",
        state: "success",
        creator: { login: TRUSTED_STATUS_LOGIN },
      },
    ]
  );
  assert.equal(JSON.parse(out[0]).rows[0].state, "review failed");
});

test("a failed status lookup is reported as unverified rather than waiting for review", () => {
  const out = [];
  run(
    ["--json"],
    () => [
      pr({
        headRefOid: "abc123",
        statusCheckRollup: [
          run_("CI Success"),
          status("Factory review", "SUCCESS"),
          status("Factory security review", "SUCCESS"),
        ],
      }),
    ],
    (text) => out.push(text),
    null,
    () => null
  );
  const result = JSON.parse(out[0]).rows[0];
  assert.deepEqual(
    [result.state, result.needs],
    ["review not verified", "owner"]
  );
});
