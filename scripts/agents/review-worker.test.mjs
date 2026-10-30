import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publishReviewStatus } from "./github-app-status.mjs";
import { createReviewReceipt } from "./review-receipt.mjs";
import {
  advisoryReviewCacheKey,
  advisoryReviewCachePath,
  assertReviewStatusApp,
  branchSyncConflictsPath,
  CONTEXTS,
  ciBlockers,
  dependencyFirst,
  eligible,
  ownerMergeRequired,
  processPull,
  processQueue,
  publishReviewStatusThroughApp,
  readAdvisoryReviewCache,
  readBranchSyncConflicts,
  requiredChecks,
  reviewPaths,
  reviewStatusAppLogin,
  reviewStatusIntegrationId,
  run,
  securityRequired,
  services,
  statusDescription,
  statusMatches,
  strictStatusChecksRequired,
  trustedReviewInstructions,
  writeAdvisoryReviewCache,
  writeBranchSyncConflicts,
} from "./review-worker.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const REPO = { full_name: "Marcus100/grenmet" };
const PR = {
  number: 588,
  state: "open",
  draft: false,
  changed_files: 1,
  head: { sha: HEAD, ref: "factory/example", repo: REPO },
  base: { sha: BASE, ref: "dev", repo: REPO },
  labels: [],
};
const CI = ["CI Success", "Build Web Apps"];
const ADVISORY_MERGE_CONFLICT = /cannot be combined/u;
const BASE_QUERY = /base=([^&]+)/u;
const PIN_REVIEW_CONTEXTS = /pin both review status contexts/u;
const ONE_REVIEW_APP = /one GitHub App/u;
const STATUS_APP_MISMATCH = /does not match the Protect dev ruleset/u;
const INCOMPLETE_FILE_LIST = /complete pull request file list/u;
const FILE_LIST_HEAD_MISMATCH = /file list does not match the pinned head/u;
const APP_IDENTITY_UNAVAILABLE =
  /Could not establish the configured GitHub App identity/u;
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
  pinnedFiles = files,
  code = 0,
  result = CLEAN,
  checks = CHECKS,
  changedFiles = files.length,
  changed = false,
  baseTip = BASE,
  mergeBase = BASE,
  labels = [],
  labelsAfterPull = Number.POSITIVE_INFINITY,
  labelsAfter = [],
  baseFiles = [],
  baseFilesAfterReview,
  updateResult = { updated: true },
} = {}) {
  const calls = [];
  const statuses = [];
  let pulls = 0;
  const api = {
    login: () => "review-status-app[bot]",
    pull: () => {
      pulls++;
      return {
        ...PR,
        changed_files: changedFiles,
        labels: pulls >= labelsAfterPull ? labelsAfter : labels,
        base: {
          ...PR.base,
          sha: changed && pulls > 1 ? "c".repeat(40) : baseTip,
        },
      };
    },
    files: () => ({ count: files.length, paths: files }),
    diffFiles: () => pinnedFiles,
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
    prepare: () => mergeBase,
    baseChanges: (_mergeBase, currentBase) =>
      currentBase !== baseTip && baseFilesAfterReview !== undefined
        ? baseFilesAfterReview
        : baseFiles,
    updateBranch: (number) => {
      calls.push(`update:${number}`);
      return updateResult;
    },
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
        creator: { login: "review-status-app[bot]" },
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
  for (const base of ["staging", "main"]) {
    const promoted = { ...PR, base: { ...PR.base, ref: base } };
    assert.equal(eligible(promoted), false);
    assert.equal(eligible(promoted, false, true), true);
  }
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

test("advisory mode reviews unlabelled PRs with pending CI while behind and never mutates branches or statuses", () => {
  const { api, calls } = fake({
    checks: [
      { name: CI[0], status: "IN_PROGRESS" },
      { name: CI[1], status: "COMPLETED", conclusion: "FAILURE" },
    ],
    baseTip: "c".repeat(40),
    baseFiles: ["docs/example.md"],
  });
  api.login = () => {
    throw new Error("advisory must not verify or mint App status identity");
  };
  api.statuses = () => {
    throw new Error("advisory must not read statuses");
  };
  api.publish = () => {
    throw new Error("advisory must not publish statuses");
  };
  api.updateBranch = () => {
    throw new Error("advisory must not sync branches");
  };
  api.merge = () => {
    throw new Error("advisory must never merge");
  };

  assert.equal(
    processPull(588, { advisory: true, merge: true }, api, CI).outcome,
    "reviewed"
  );
  assert.ok(calls.includes("review:code"));
  assert.ok(!calls.some((call) => call.startsWith("update:")));
  assert.ok(!calls.includes("merge"));
});

test("advisory mode lists unlabelled same-repository PRs and avoids ruleset requirements", () => {
  const queries = [];
  const service = services("/worker", (_name, args) => {
    assert.equal(args[0], "api");
    queries.push(args.at(-1));
    return { status: 0, stdout: JSON.stringify([[{ ...PR, labels: [] }]]) };
  });
  assert.deepEqual(service.list({ advisory: true }), [588]);
  assert.deepEqual(
    new Set(queries.slice(0, 3).map((query) => query.match(BASE_QUERY)?.[1])),
    new Set(["dev", "staging", "main"])
  );
  assert.deepEqual(service.list(), []);
  assert.deepEqual(requiredChecks("/missing", true), []);
  assert.equal(strictStatusChecksRequired("/missing", true), false);
  assert.equal(
    run(["--once", "--advisory"], "/missing", {
      list: ({ advisory }) => {
        assert.equal(advisory, true);
        return [];
      },
    }),
    0
  );
});

test("advisory cache lets a completed first PR yield to the next unreviewed PR", () => {
  const { api, reviewed } = queueApi();
  const cache = new Map([
    [
      advisoryReviewCacheKey(1, headOf(1), "code"),
      {
        status: "completed",
        verdict: "approve",
        completedAt: new Date().toISOString(),
      },
    ],
  ]);
  const errors = processQueue(
    [1, 2],
    { advisory: true, advisoryReviewCache: cache },
    api,
    [],
    () => undefined
  );
  assert.equal(errors, 0);
  assert.deepEqual(reviewed, ["2:code"]);
});

test("advisory cache records a completed changes-requested verdict", () => {
  const { api, reviewed } = queueApi({ code: 1 });
  const cache = new Map();
  api.review = (number, kind, info) => {
    reviewed.push(`${number}:${kind}`);
    return {
      code: 1,
      receipt: createReviewReceipt(info, {
        ...CLEAN,
        verdict: "changes_requested",
      }),
    };
  };
  assert.equal(
    processPull(1, { advisory: true, advisoryReviewCache: cache }, api, [])
      .outcome,
    "reviewed"
  );
  assert.equal(
    cache.get(advisoryReviewCacheKey(1, headOf(1), "code")).verdict,
    "changes_requested"
  );
});

test("failed advisory reviews are not cached, and explicit retry bypasses completed cache", () => {
  const failed = queueApi();
  const failedCache = new Map();
  failed.api.review = (_number, _kind, info) => ({
    code: 1,
    receipt: createReviewReceipt(info, { ...CLEAN, status: "incomplete" }),
  });
  assert.throws(() =>
    processPull(
      1,
      { advisory: true, advisoryReviewCache: failedCache },
      failed.api,
      []
    )
  );
  assert.equal(failedCache.size, 0);

  const retried = queueApi();
  const retryCache = new Map([
    [
      advisoryReviewCacheKey(1, headOf(1), "code"),
      {
        status: "completed",
        verdict: "approve",
        completedAt: new Date().toISOString(),
      },
    ],
  ]);
  processPull(
    1,
    { advisory: true, retry: true, advisoryReviewCache: retryCache },
    retried.api,
    []
  );
  assert.deepEqual(retried.reviewed, ["1:code"]);

  const changedHead = queueApi({ headShas: { 1: "c".repeat(40) } });
  processPull(
    1,
    { advisory: true, advisoryReviewCache: retryCache },
    changedHead.api,
    []
  );
  assert.deepEqual(changedHead.reviewed, ["1:code"]);
});

test("advisory cache waits for both code and security comments before persisting", () => {
  const { api } = fake({ files: [".github/workflows/check.yml"] });
  const cache = new Map();
  let persisted = false;
  api.review = (_number, kind, info) => ({
    code: kind === "security" ? 1 : 0,
    receipt: createReviewReceipt(
      info,
      kind === "security" ? { ...CLEAN, status: "incomplete" } : CLEAN
    ),
  });
  assert.throws(() =>
    processPull(
      588,
      {
        advisory: true,
        advisoryReviewCache: cache,
        persistAdvisoryReviewCache: () => {
          persisted = true;
        },
      },
      api,
      []
    )
  );
  assert.equal(persisted, false);
  assert.equal(cache.has(advisoryReviewCacheKey(588, HEAD, "code")), true);
});

test("advisory cache is private, atomic, and stored in git metadata", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const path = advisoryReviewCachePath(root, (_command, _args) => ({
    status: 0,
    stdout: ".git\n",
  }));
  assert.ok(path.includes("agent-review-state"));
  const directory = mkdtempSync(join(tmpdir(), "advisory-cache-"));
  const cachePath = join(directory, "private", "cache.json");
  const cache = new Map([
    [
      advisoryReviewCacheKey(588, HEAD, "code"),
      {
        status: "completed",
        verdict: "approve",
        completedAt: new Date().toISOString(),
      },
    ],
  ]);
  try {
    writeAdvisoryReviewCache(cachePath, cache);
    assert.equal(readAdvisoryReviewCache(cachePath).size, 1);
    chmodSync(cachePath, 0o644);
    assert.throws(() => readAdvisoryReviewCache(cachePath), Error);
    chmodSync(cachePath, 0o600);
    chmodSync(join(directory, "private"), 0o755);
    assert.throws(() => readAdvisoryReviewCache(cachePath), Error);
    chmodSync(join(directory, "private"), 0o700);
    assert.equal(statSync(cachePath).mode.toString(8).slice(-3), "600");
    assert.equal(
      statSync(join(directory, "private")).mode.toString(8).slice(-3),
      "700"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI refuses to combine advisory mode with merge mode", () => {
  assert.throws(
    () => run(["--once", "--advisory", "--merge"], "/missing"),
    ADVISORY_MERGE_CONFLICT
  );
});

test("the worker reads either strict branch policy without assuming live rules", () => {
  const root = mkdtempSync(join(tmpdir(), "review-policy-"));
  const directory = join(root, "infra/github");
  mkdirSync(directory, { recursive: true });
  try {
    for (const strict of [true, false]) {
      writeFileSync(
        join(directory, "rulesets.json"),
        JSON.stringify([
          {
            name: "Protect dev",
            rules: [
              {
                type: "required_status_checks",
                parameters: {
                  strict_required_status_checks_policy: strict,
                  required_status_checks: [],
                },
              },
            ],
          },
        ])
      );
      assert.equal(strictStatusChecksRequired(root), strict);
      assert.equal(strictStatusChecksRequired(root, true), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review statuses require both contexts pinned to the same GitHub App", () => {
  const checks = [
    { context: CONTEXTS.code, integration_id: 42 },
    { context: CONTEXTS.security, integration_id: 42 },
  ];
  assert.equal(reviewStatusIntegrationId(checks), 42);
  assert.throws(
    () =>
      reviewStatusIntegrationId([
        { ...checks[0] },
        { context: CONTEXTS.security },
      ]),
    PIN_REVIEW_CONTEXTS
  );
  assert.throws(
    () =>
      reviewStatusIntegrationId([
        { ...checks[0] },
        { ...checks[1], integration_id: 43 },
      ]),
    ONE_REVIEW_APP
  );
});

test("review statuses trust the bot login returned by the pinned GitHub App", () => {
  const root = mkdtempSync(join(tmpdir(), "review-status-login-root-"));
  const snapshotDir = join(root, "infra", "github");
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(
    join(snapshotDir, "rulesets.json"),
    JSON.stringify([
      {
        name: "Protect dev",
        rules: [
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: CONTEXTS.code, integration_id: 42 },
                { context: CONTEXTS.security, integration_id: 42 },
              ],
            },
          },
        ],
      },
    ])
  );
  const env = { GRENMET_REVIEW_STATUS_APP_ID: "42", GH_TOKEN: "user-token" };
  let invocation;
  try {
    assert.equal(
      reviewStatusAppLogin(
        root,
        (command, args, options) => {
          invocation = { command, args, options };
          return { status: 0, stdout: "grenmet-review-status[bot]\n" };
        },
        env
      ),
      "grenmet-review-status[bot]"
    );
    assert.equal(invocation.command, process.execPath);
    assert.ok(
      invocation.args[0].endsWith("scripts/agents/github-app-status.mjs")
    );
    assert.deepEqual(JSON.parse(invocation.options.input), {
      action: "identity",
      expectedAppId: "42",
      repoRoot: root,
    });
    assert.equal(invocation.options.env.GH_TOKEN, undefined);
    assert.throws(
      () =>
        reviewStatusAppLogin(
          root,
          () => ({ status: 0, stdout: "human-user\n" }),
          env
        ),
      APP_IDENTITY_UNAVAILABLE
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("status publishing passes its serialized payload through the App contract", async () => {
  const parent = mkdtempSync(join(tmpdir(), "review-status-root-"));
  const root = join(parent, "repo");
  const privateKeyPath = join(parent, "review-status-app.pem");
  mkdirSync(root);
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(
    privateKeyPath,
    pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    { mode: 0o600 }
  );
  chmodSync(privateKeyPath, 0o600);
  const snapshotDir = join(root, "infra", "github");
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(
    join(snapshotDir, "rulesets.json"),
    JSON.stringify([
      {
        name: "Protect dev",
        rules: [
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: CONTEXTS.code, integration_id: 42 },
                { context: CONTEXTS.security, integration_id: 42 },
              ],
            },
          },
        ],
      },
    ])
  );
  const env = {
    GRENMET_REVIEW_STATUS_APP_ID: "42",
    GRENMET_REVIEW_STATUS_INSTALLATION_ID: "7",
    GRENMET_REVIEW_STATUS_APP_PRIVATE_KEY_FILE: privateKeyPath,
    GH_TOKEN: "human-token",
    GITHUB_TOKEN: "workflow-token",
    GH_ENTERPRISE_TOKEN: "enterprise-token",
    PATH: "/usr/bin",
  };
  const status = {
    head: "a".repeat(40),
    context: CONTEXTS.code,
    state: "success",
    description: "base=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;scope=code",
    number: 588,
  };
  let invocation;
  try {
    assert.equal(assertReviewStatusApp(root, env), 42);
    publishReviewStatusThroughApp(
      root,
      status,
      (command, args, options) => {
        invocation = { command, args, options };
        return { status: 0, stdout: "" };
      },
      env
    );
    assert.equal(invocation.command, process.execPath);
    assert.ok(
      invocation.args[0].endsWith("scripts/agents/github-app-status.mjs")
    );
    assert.equal(invocation.options.env.GH_TOKEN, undefined);
    assert.equal(invocation.options.env.GITHUB_TOKEN, undefined);
    assert.equal(invocation.options.env.GH_ENTERPRISE_TOKEN, undefined);
    const payload = JSON.parse(invocation.options.input);
    assert.deepEqual(payload, {
      action: "publish",
      status,
      expectedAppId: "42",
      repoRoot: root,
    });
    const calls = [];
    await publishReviewStatus({
      ...payload,
      env,
      fetchImpl: (url, options) => {
        calls.push({ url, options });
        if (url.endsWith("/app/installations/7/access_tokens")) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              token: "status-token",
              expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
              permissions: { statuses: "write" },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ state: "success" }),
        });
      },
    });
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.endsWith(`/statuses/${status.head}`));
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      context: status.context,
      description: status.description,
      state: status.state,
      target_url: "https://github.com/Marcus100/grenmet/pull/588",
    });
    assert.throws(
      () =>
        publishReviewStatusThroughApp(root, status, () => ({ status: 0 }), {
          ...env,
          GRENMET_REVIEW_STATUS_APP_ID: "43",
        }),
      STATUS_APP_MISMATCH
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("PR listing paginates beyond 30 and filters drafts and labels", () => {
  const candidate = (number) => ({
    number,
    draft: false,
    created_at: new Date(Date.UTC(2026, 0, number)).toISOString(),
    labels: [{ name: "factory-review" }],
    head: { sha: number.toString(16).padStart(40, "0") },
  });
  const pages = [
    Array.from({ length: 30 }, (_, index) => candidate(index + 1)).concat([
      { ...candidate(31), draft: true },
      { ...candidate(32), labels: [{ name: "documentation" }] },
    ]),
    [candidate(33)],
  ];
  const calls = [];
  const api = services("/repo", (name, args) => {
    calls.push({ name, args });
    if (name === "gh") return { status: 0, stdout: JSON.stringify(pages) };
    if (name === "git" && args[0] === "fetch") return { status: 0, stdout: "" };
    if (name === "git" && args[0] === "merge-base")
      return { status: 1, stdout: "" };
    throw new Error(`Unexpected command: ${name} ${args.join(" ")}`);
  });
  assert.deepEqual(
    api.list(),
    Array.from({ length: 30 }, (_, i) => i + 1).concat(33)
  );
  const listCall = calls.find((call) => call.name === "gh");
  assert.ok(listCall.args.includes("--paginate"));
  assert.ok(listCall.args.includes("--slurp"));
  assert.ok(
    listCall.args.includes(
      "repos/Marcus100/grenmet/pulls?state=open&base=dev&per_page=100"
    )
  );
});

test("worker file lookup rejects malformed entries before path classification", () => {
  for (const file of [
    { previous_filename: "hidden-owner-file" },
    { filename: "docs/new.md", previous_filename: 42 },
    { filename: "docs/new.md", status: "renamed" },
  ]) {
    const api = services("/repo", (name) => {
      if (name === "gh") return { status: 0, stdout: JSON.stringify([[file]]) };
      throw new Error(`Unexpected command: ${name}`);
    });
    assert.throws(() => api.files(588), INCOMPLETE_FILE_LIST);
  }
});

test("ordinary work gets one independent review and can merge the pinned head", () => {
  const { api, calls } = fake();
  assert.equal(processPull(588, { merge: true }, api, CI).outcome, "merged");
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 1);
  assert.ok(calls.includes("merge"));
  assert.equal(calls.at(-1), "release");
});

test("owner-only files are reviewed but never auto-merged", () => {
  for (const file of [
    ".claude/hooks/example.mjs",
    ".claude/settings.json",
    ".claude/agents/code-reviewer.md",
    ".codex/config.toml",
    ".agents/skills/example/SKILL.md",
    ".github/workflows/ci.yml",
    ".github/CODEOWNERS",
    "apps/example/AGENTS.md",
    "scripts/guardrails/example.mjs",
    "scripts/verification/changed.mjs",
    "package.json",
    "docs/agents/routines.md",
    "apps/api/fastapi/src/auth/permissions.py",
    "infra/github/rulesets.json",
  ])
    assert.equal(ownerMergeRequired([file]), true, file);
  assert.equal(ownerMergeRequired(["scripts/agents/review-worker.mjs"]), false);

  const { api, calls } = fake({ files: ["infra/github/rulesets.json"] });
  const result = processPull(588, { merge: true }, api, CI);
  assert.equal(result.outcome, "reviewed");
  assert.ok(result.reason.includes("owner-only files"));
  assert.ok(calls.includes("review:security"));
  assert.ok(!calls.includes("merge"));
});

test("an incomplete GitHub file list cannot be reviewed or merged", () => {
  const { api, calls } = fake({ changedFiles: 3001 });
  assert.throws(
    () => processPull(588, { merge: true }, api, CI),
    INCOMPLETE_FILE_LIST
  );
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 0);
  assert.ok(!calls.includes("merge"));
});

test("a file list read from a different PR head cannot be reviewed or merged", () => {
  const { api, calls } = fake({
    files: ["docs/ordinary.md"],
    pinnedFiles: ["infra/github/rulesets.json"],
  });
  assert.throws(
    () => processPull(588, { merge: true }, api, CI),
    FILE_LIST_HEAD_MISMATCH
  );
  assert.equal(calls.filter((call) => call.startsWith("review:")).length, 0);
  assert.ok(!calls.includes("merge"));
});

test("factory controls and high-risk application changes require a security review", () => {
  for (const file of [
    ".claude/hooks/example.mjs",
    "AGENTS.md",
    "scripts/agents/worker.mjs",
    "scripts/ci/ai-review.mjs",
    "scripts/production/deploy.py",
    "docs/agents/workflow.md",
    "docs/agents/routing.json",
    "apps/api/fastapi/src/auth/service.py",
  ]) {
    assert.equal(securityRequired([file]), true);
  }
  const { api, calls } = fake({ files: ["scripts/agents/worker.mjs"] });
  processPull(588, { merge: true }, api, CI);
  assert.ok(calls.includes("review:code"));
  assert.ok(calls.includes("review:security"));
});

test("the risk:high label forces a security review even on ordinary paths", () => {
  const { api, calls } = fake({ labels: [{ name: "risk:high" }] });
  processPull(588, {}, api, CI);
  assert.ok(calls.includes("review:security"));
});

test("a risk:high label added during code review triggers the security review", () => {
  const { api, calls } = fake({
    labelsAfterPull: 2,
    labelsAfter: [{ name: "risk:high" }],
  });
  processPull(588, {}, api, CI);
  assert.ok(calls.includes("review:security"));
});

test("a risk:high label added after the security decision prevents merge", () => {
  const { api, calls } = fake({
    labelsAfterPull: 4,
    labelsAfter: [{ name: "risk:high" }],
  });
  assert.throws(() => processPull(588, { merge: true }, api, CI));
  assert.ok(!calls.includes("merge"));
  assert.ok(!calls.includes("review:security"));
});

test("review context uses trusted worker instructions rather than PR files", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const instructions = trustedReviewInstructions(root, "code-reviewer", [
    ".claude/agents/code-reviewer.md",
    "scripts/agents/review-worker.mjs",
  ]);
  assert.ok(
    instructions.includes("Canonical instructions for every coding agent")
  );
  assert.ok(instructions.includes("Fresh-context code reviewer"));
  assert.ok(instructions.includes("blast-radius table"));
  assert.ok(instructions.includes("same-named files in the PR"));
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

test("branch-conflict state is kept beside review receipts in Git metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "review-branch-conflict-path-"));
  try {
    assert.equal(
      branchSyncConflictsPath(root, () => ({ status: 0, stdout: ".git\n" })),
      join(root, ".git", "agent-branch-sync-conflicts.json")
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review failure, incompletion, missing receipt or strict base advance cannot approve or merge", () => {
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

test("disjoint dev advances preserve review scope and allow merge when strict checks are off", () => {
  const { api, calls, statuses } = fake({
    baseTip: "c".repeat(40),
    mergeBase: BASE,
    baseFiles: ["apps/web/gms/page.tsx"],
  });
  assert.equal(
    processPull(588, { merge: true, strictStatusChecks: false }, api, CI)
      .outcome,
    "merged"
  );
  assert.ok(calls.includes("merge"));
  assert.ok(
    statuses.some(
      (status) =>
        status.context === CONTEXTS.code &&
        status.description === `base=${BASE};scope=code`
    )
  );
});

test("overlapping dev changes sync the PR and wait for new CI", () => {
  const { api, calls } = fake({
    baseTip: "c".repeat(40),
    mergeBase: BASE,
    baseFiles: ["docs/example.md"],
  });
  const result = processPull(
    588,
    { merge: true, strictStatusChecks: false },
    api,
    CI
  );
  assert.equal(result.outcome, "waiting");
  assert.ok(result.reason.includes("updated from dev"));
  assert.ok(calls.includes("update:588"));
  assert.ok(!calls.some((call) => call.startsWith("review:")));
});

test("overlap conflict waits for conflict resolution without review", () => {
  const { api, calls } = fake({
    baseTip: "c".repeat(40),
    mergeBase: BASE,
    baseFiles: ["docs/example.md"],
    updateResult: { updated: false, conflict: true },
  });
  const result = processPull(
    588,
    { merge: true, strictStatusChecks: false },
    api,
    CI
  );
  assert.equal(result.outcome, "waiting");
  assert.ok(result.reason.includes("conflicts"));
  assert.ok(!calls.some((call) => call.startsWith("review:")));
});

test("strict branch protection syncs stale PRs before review", () => {
  const { api, calls } = fake({ baseTip: "c".repeat(40), mergeBase: BASE });
  const result = processPull(588, { merge: true }, api, CI);
  assert.equal(result.outcome, "waiting");
  assert.ok(calls.includes("update:588"));
  assert.ok(!calls.some((call) => call.startsWith("review:")));
});

test("a disjoint dev advance during review does not invalidate the exact PR diff", () => {
  const { api, calls } = fake({ changed: true });
  assert.equal(
    processPull(588, { strictStatusChecks: false }, api, CI).outcome,
    "reviewed"
  );
  assert.ok(calls.includes("publish:Factory review:success"));
});

test("a newly overlapping dev change during review prevents approval", () => {
  const { api, calls, statuses } = fake({
    changed: true,
    baseFilesAfterReview: ["docs/example.md"],
  });
  assert.throws(() => processPull(588, { strictStatusChecks: false }, api, CI));
  assert.ok(!calls.includes("merge"));
  assert.equal(statuses[0].state, "failure");
});

test("unintegrated base, another owner's claim and dry-run make no model calls", () => {
  const { api, calls } = fake();
  assert.equal(processPull(588, { dryRun: true }, api, CI).outcome, "ready");
  assert.deepEqual(calls, []);
  api.claim = () => ({ claimed: false });
  assert.equal(processPull(588, {}, api, CI).outcome, "waiting");
  api.claim = () => ({ claimed: true });
  api.prepare = () => "c".repeat(40);
  const stale = processPull(588, {}, api, CI);
  assert.equal(stale.outcome, "waiting");
  assert.ok(stale.reason.includes("--merge"));
  assert.ok(!calls.some((call) => call.startsWith("review:")));
  assert.equal(calls.at(-1), "release");
});

const headOf = (number) => String(number).padStart(40, "1");

function queueApi({
  stale = [],
  broken = [],
  code = 0,
  mergeThrows = [],
  releaseThrows = [],
  ciFailsAfterReview = false,
  syncThrows = false,
  syncConflicts = [],
  baseSha = BASE,
  headShas = {},
} = {}) {
  const store = [];
  const reviewed = [];
  const synced = [];
  const api = {
    login: () => "review-status-app[bot]",
    pull: (number) => {
      if (broken.includes(number)) throw new Error(`pull ${number} failed`);
      return {
        ...PR,
        number,
        head: { ...PR.head, sha: headShas[number] ?? headOf(number) },
        base: { ...PR.base, sha: baseSha },
      };
    },
    files: () => ({ count: 1, paths: ["docs/example.md"] }),
    diffFiles: () => ["docs/example.md"],
    checks: () =>
      ciFailsAfterReview && reviewed.length > 0
        ? CHECKS.map((check) => ({ ...check, conclusion: "FAILURE" }))
        : CHECKS,
    statuses: (head) => store.filter((status) => status.head === head),
    claim: () => ({ claimed: true }),
    release: (number) => {
      if (releaseThrows.includes(number)) throw new Error("release failed");
      return { released: true };
    },
    prepare: (head) =>
      stale.some((number) => head === headOf(number)) ? "c".repeat(40) : BASE,
    baseChanges: () => [],
    updateBranch: (number) => {
      synced.push(number);
      if (syncThrows) throw new Error("update branch failed");
      if (syncConflicts.includes(number))
        return { updated: false, conflict: true };
      return { updated: true };
    },
    review: (number, kind, info) => {
      reviewed.push(`${number}:${kind}`);
      return { code, receipt: createReviewReceipt(info, CLEAN) };
    },
    publish: (head, context, state, description) =>
      store.unshift({
        head,
        context,
        state,
        description,
        creator: { login: "review-status-app[bot]" },
      }),
    merge: (number) => {
      if (mergeThrows.includes(number)) throw new Error("merge failed");
    },
  };
  return { api, reviewed, synced };
}

test("a stale PR at the front of the queue cannot starve the ready PR behind it", () => {
  const { api, reviewed } = queueApi({ stale: [1] });
  const lines = [];
  const errors = processQueue([1, 2], {}, api, CI, (line) => lines.push(line));
  assert.equal(errors, 0);
  assert.deepEqual(reviewed, ["2:code"]);
  const [first, second] = lines.slice(0, -1).map((line) => JSON.parse(line));
  assert.deepEqual([first.pr, first.outcome], [1, "waiting"]);
  assert.deepEqual([second.pr, second.outcome], [2, "reviewed"]);
  assert.deepEqual(JSON.parse(lines.at(-1)), {
    queueSummary: true,
    candidates: 2,
    processed: 2,
    errors: 0,
    reviewed: 1,
    reviewAttempts: 1,
    branchSyncAttempts: 0,
    merged: 0,
    waiting: 1,
    skipped: 0,
    ready: 0,
  });
});

test("one queue run syncs at most one stale PR and waits for its new CI", () => {
  const { api, reviewed, synced } = queueApi({ stale: [1, 2] });
  const lines = [];
  const errors = processQueue([1, 2], { merge: true }, api, CI, (line) =>
    lines.push(line)
  );
  assert.equal(errors, 0);
  assert.deepEqual(synced, [1]);
  assert.deepEqual(reviewed, []);
  assert.equal(JSON.parse(lines[0]).branchSynced, true);
  assert.equal(JSON.parse(lines.at(-1)).branchSyncAttempts, 1);
  assert.equal(JSON.parse(lines.at(-1)).processed, 1);
});

test("a failed branch-sync attempt stops before syncing another candidate", () => {
  const { api, reviewed, synced } = queueApi({
    stale: [1, 2],
    syncThrows: true,
  });
  const lines = [];
  const errors = processQueue([1, 2], { merge: true }, api, CI, (line) =>
    lines.push(line)
  );
  assert.equal(errors, 1);
  assert.deepEqual(synced, [1]);
  assert.deepEqual(reviewed, []);
  assert.equal(JSON.parse(lines[0]).branchSyncAttempted, true);
  assert.equal(JSON.parse(lines.at(-1)).branchSyncAttempts, 1);
  assert.equal(JSON.parse(lines.at(-1)).processed, 1);
});

test("branch conflicts persist by head and base without starving ready PRs", () => {
  const parent = mkdtempSync(join(tmpdir(), "review-branch-conflicts-"));
  const path = join(parent, "branch-sync-conflicts.json");
  let conflicts = new Map();
  try {
    const first = queueApi({ stale: [1, 2], syncConflicts: [1] });
    const firstLines = [];
    assert.equal(
      processQueue(
        [1, 2, 3],
        { merge: true },
        first.api,
        CI,
        (line) => firstLines.push(line),
        {
          branchSyncConflicts: conflicts,
          persistBranchSyncConflicts: () =>
            writeBranchSyncConflicts(path, conflicts),
        }
      ),
      0
    );
    assert.deepEqual(first.synced, [1]);
    assert.deepEqual(first.reviewed, ["3:code"]);
    assert.deepEqual(conflicts.get(1), { head: headOf(1), base: BASE });
    assert.equal(JSON.parse(firstLines.at(-1)).branchSyncAttempts, 1);

    conflicts = readBranchSyncConflicts(path);
    const retry = queueApi({ stale: [1], syncConflicts: [1] });
    const retryLines = [];
    assert.equal(
      processQueue(
        [1, 4],
        { merge: true },
        retry.api,
        CI,
        (line) => retryLines.push(line),
        { branchSyncConflicts: conflicts }
      ),
      0
    );
    assert.deepEqual(retry.synced, []);
    assert.deepEqual(retry.reviewed, ["4:code"]);
    assert.ok(
      JSON.parse(retryLines[0]).reason.includes("previously conflicted")
    );

    const changedBase = "d".repeat(40);
    const changed = queueApi({
      stale: [1],
      syncConflicts: [1],
      baseSha: changedBase,
    });
    assert.equal(
      processQueue([1], { merge: true }, changed.api, CI, () => undefined, {
        branchSyncConflicts: conflicts,
      }),
      0
    );
    assert.deepEqual(changed.synced, [1]);
    assert.deepEqual(conflicts.get(1), {
      head: headOf(1),
      base: changedBase,
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a release failure after branch sync preserves the one-sync limit", () => {
  const { api, reviewed, synced } = queueApi({
    stale: [1, 2],
    releaseThrows: [1],
  });
  const lines = [];
  const errors = processQueue([1, 2], { merge: true }, api, CI, (line) =>
    lines.push(line)
  );
  assert.equal(errors, 1);
  assert.deepEqual(synced, [1]);
  assert.deepEqual(reviewed, []);
  assert.equal(JSON.parse(lines[0]).branchSyncAttempted, true);
  assert.equal(JSON.parse(lines.at(-1)).branchSyncAttempts, 1);
  assert.equal(JSON.parse(lines.at(-1)).processed, 1);
});

test("a candidate that errors before any review does not stop the queue", () => {
  const { api, reviewed } = queueApi({ broken: [1] });
  const lines = [];
  const errors = processQueue([1, 2], {}, api, CI, (line) => lines.push(line));
  assert.equal(errors, 1);
  assert.deepEqual(reviewed, ["2:code"]);
  const [first, second] = lines.slice(0, -1).map((line) => JSON.parse(line));
  assert.deepEqual([first.pr, first.outcome], [1, "error"]);
  assert.ok(first.reason.includes("pull 1 failed"));
  assert.deepEqual([second.pr, second.outcome], [2, "reviewed"]);
  assert.equal(JSON.parse(lines.at(-1)).errors, 1);
});

test("after a failed review the queue stops: one review per invocation", () => {
  const { api, reviewed } = queueApi({ code: 1 });
  const lines = [];
  const errors = processQueue([1, 2], {}, api, CI, (line) => lines.push(line));
  assert.equal(errors, 1);
  assert.deepEqual(reviewed, ["1:code"]);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines.at(-1)).processed, 1);
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
    statusMatches(
      statuses,
      CONTEXTS.code,
      "c".repeat(40),
      "code",
      "review-status-app[bot]"
    ),
    false
  );
  statuses.unshift({
    ...statuses.find((status) => status.context === CONTEXTS.code),
    state: "failure",
  });
  assert.equal(
    statusMatches(
      statuses,
      CONTEXTS.code,
      BASE,
      "code",
      "review-status-app[bot]"
    ),
    false
  );
});

test("an untrusted failure status cannot suppress a fresh review", () => {
  const { api, calls, statuses } = fake();
  statuses.push({
    context: CONTEXTS.code,
    state: "failure",
    description: statusDescription(BASE, "code"),
    creator: { login: "repository-writer" },
  });
  assert.equal(processPull(588, {}, api, CI).outcome, "reviewed");
  assert.ok(calls.includes("review:code"));
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

test("an error after a review started stops the queue: merge, post-review check or release", () => {
  for (const [name, setup] of [
    ["merge throws", { mergeThrows: [1] }],
    ["CI turns red after the review", { ciFailsAfterReview: true }],
    ["releasing the claim throws", { releaseThrows: [1] }],
  ]) {
    const { api, reviewed } = queueApi(setup);
    const lines = [];
    const errors = processQueue([1, 2], { merge: true }, api, CI, (line) =>
      lines.push(line)
    );
    assert.equal(errors, 1, name);
    assert.deepEqual(
      reviewed,
      ["1:code"],
      `${name}: PR 2 must not be reviewed`
    );
    assert.equal(lines.length, 2, name);
    assert.equal(JSON.parse(lines[0]).outcome, "error", name);
    assert.equal(JSON.parse(lines.at(-1)).reviewAttempts, 1, name);
  }
});

test("an error before any review still lets the next PR be reviewed", () => {
  const { api, reviewed } = queueApi({ broken: [1] });
  const errors = processQueue(
    [1, 2],
    { merge: true },
    api,
    CI,
    () => undefined
  );
  assert.equal(errors, 1);
  assert.deepEqual(reviewed, ["2:code"]);
});

test("a cached review does not consume this invocation's review allowance", () => {
  const { api, reviewed } = queueApi({ mergeThrows: [1] });
  const initialErrors = processQueue([1], {}, api, CI, () => undefined);
  assert.equal(initialErrors, 0);
  assert.deepEqual(reviewed, ["1:code"]);

  reviewed.length = 0;
  const errors = processQueue(
    [1, 2],
    { merge: true },
    api,
    CI,
    () => undefined
  );
  assert.equal(errors, 1);
  assert.deepEqual(reviewed, ["2:code"]);
});

test("cached review continues to the next PR when merging is disabled", () => {
  const { api, reviewed } = queueApi();
  const initialErrors = processQueue([1], {}, api, CI, () => undefined);
  assert.equal(initialErrors, 0);
  assert.deepEqual(reviewed, ["1:code"]);

  reviewed.length = 0;
  const errors = processQueue([1, 2], {}, api, CI, () => undefined);
  assert.equal(errors, 0);
  assert.deepEqual(reviewed, ["2:code"]);
});

test("dependency-first queue order puts a stacked PR before its descendant", () => {
  const candidates = [
    {
      number: 10,
      headRefOid: "a".repeat(40),
      createdAt: "2026-10-03T00:00:00Z",
    },
    {
      number: 11,
      headRefOid: "b".repeat(40),
      createdAt: "2026-10-01T00:00:00Z",
    },
    {
      number: 12,
      headRefOid: "c".repeat(40),
      createdAt: "2026-10-02T00:00:00Z",
    },
  ];
  assert.deepEqual(
    dependencyFirst(
      candidates,
      (parent, child) => parent === "a".repeat(40) && child === "c".repeat(40)
    ),
    [11, 10, 12]
  );
});

test("dry-run reports every candidate and performs no claims or model calls", () => {
  const { api, reviewed } = queueApi();
  const lines = [];
  processQueue([1, 2], { dryRun: true }, api, CI, (line) => lines.push(line));
  assert.deepEqual(reviewed, []);
  assert.deepEqual(
    lines.slice(0, -1).map((line) => JSON.parse(line).outcome),
    ["ready", "ready"]
  );
  assert.equal(JSON.parse(lines.at(-1)).ready, 2);
});
