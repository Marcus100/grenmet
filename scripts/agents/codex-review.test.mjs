import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { scrubbedEnv } from "./benchmark.mjs";
import {
  buildArgs,
  buildPrompt,
  collectReviewDiff,
  createReviewCodexHome,
  flag,
  pinHead,
  postBlockers,
  reviewConfig,
  reviewRuntimeRoot,
  reviewToolchainRoot,
  run,
} from "./codex-review.mjs";
import {
  createReviewReceipt,
  readReviewReceipt,
  writeReviewReceipt,
} from "./review-receipt.mjs";

const receiptDirs = [];
after(() => {
  for (const dir of receiptDirs) rmSync(dir, { recursive: true, force: true });
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
// Secret-shaped fixtures are assembled at runtime so no literal token-like
// string sits in source for a secret scanner to flag.
const STRIPE_KEY = ["sk", "live", "abcdefgh12345"].join("_");
const FINE_GRAINED_PAT = [
  "github",
  "pat",
  "11ABCDEFG0abcdefghijklmnopqrstuvwxyz",
].join("_");
const PEM_HEADER = ["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ");
const NOT_POSTED = /Not posted to PR/;
const NO_FINDINGS = /wrote no findings/;
const BLEW_UP = /codex blew up/;
const COULD_NOT_RUN = /could not run codex/;
const PIN_DIR = /codex-pin-/;
const NEEDS_VALUE = /needs a value/;
const PUSH_ORDER = /Push the branch first/;
const PUSHED_LOCAL = /Pushed: not required/;
const TREE_PINNED = /Working tree: detached checkout of the head SHA/;
const HOST_COLLECTED_DIFF = /HOST-COLLECTED DIFF/;

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

const HEADER = /^Read-only review\. Write nothing/;
const TASK_LINE = /Task: Add the thing/;
const CRITERIA_LINE = /Acceptance criteria: It does the thing/;
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const INFO = {
  base: "origin/dev",
  baseTip: BASE,
  branch: "feat/x",
  dirtyCount: 0,
  files: ["docs/a.md"],
  head: HEAD,
  mergeBase: BASE,
  pushed: true,
  receipt: null,
  remoteVerified: true,
};

test("the codex session loads the strict isolated profile and takes stdin", () => {
  const args = buildArgs("/run/user/1000/review", "/run/user/1000/out.md");
  assert.deepEqual(args.slice(0, 3), [
    "exec",
    "--strict-config",
    "--ephemeral",
  ]);
  assert.ok(args.includes("--skip-git-repo-check"));
  assert.equal(args.at(-1), "-");
  assert.ok(!args.includes("--sandbox"));
  assert.ok(!args.includes("--ignore-user-config"));
  assert.ok(!args.some((arg) => arg.includes("dangerously")));
  assert.ok(!args.includes("--full-auto"));
});

test("the prompt names the exact head and base and the author's fields", () => {
  const prompt = buildPrompt(INFO, {
    task: "Add the thing",
    criteria: "It does the thing",
    workspaceRoot: "/run/user/1000/pin",
    diffText: `diff --git a/docs/a.md b/docs/a.md\n+${BASE} ${HEAD}`,
  });
  assert.match(prompt, HEADER);
  assert.match(prompt, TASK_LINE);
  assert.match(prompt, CRITERIA_LINE);
  assert.match(prompt, new RegExp(`${BASE}\\.\\.${HEAD}`));
  assert.ok(prompt.includes("do not run git commands"));
  assert.ok(prompt.includes("diff --git a/docs/a.md b/docs/a.md"));
  assert.ok(prompt.includes("/run/user/1000/pin"));
  assert.ok(!prompt.includes("<fill in>"));
});

test("an unpushed branch is not told to push before a local review", () => {
  const prompt = buildPrompt({ ...INFO, pushed: false, dirtyCount: 2 }, {});
  assert.doesNotMatch(prompt, PUSH_ORDER);
  assert.match(prompt, PUSHED_LOCAL);
  assert.match(prompt, TREE_PINNED);
});

test("the pinned checkout holds the committed bytes, not later edits", () => {
  const repo = mkdtempSync(join(tmpdir(), "codex-review-test-"));
  try {
    git(repo, "init", "-q");
    writeFileSync(join(repo, "a.txt"), "committed\n");
    git(repo, "add", "a.txt");
    git(repo, "commit", "-q", "-m", "init");
    const head = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "a.txt"), "edited after the handoff\n");
    const pin = pinHead(repo, head);
    const pinned = readFileSync(join(pin.dir, "a.txt"), "utf8");
    pin.release();
    assert.equal(pinned, "committed\n");
    assert.equal(existsSync(pin.dir), false);
    assert.doesNotMatch(git(repo, "worktree", "list"), PIN_DIR);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the minimal permission profile denies host, temp, network and writes", () => {
  const config = reviewConfig({
    workspaceRoot: "/run/user/1000/review",
    pinnedRoot: "/run/user/1000/pin",
    toolchainRoot: "/opt/node",
  });
  assert.ok(config.includes('model = "gpt-6-luna"'));
  assert.ok(config.includes('default_permissions = "grenmet-review-readonly"'));
  assert.ok(config.includes('":root" = "deny"'));
  assert.ok(config.includes('":minimal" = "read"'));
  assert.ok(config.includes('":tmpdir" = "deny"'));
  assert.ok(config.includes('":slash_tmp" = "deny"'));
  assert.ok(config.includes('"/opt/node" = "read"'));
  assert.ok(config.includes('"/run/user/1000/pin" = true'));
  assert.ok(config.includes('"." = "read"'));
  assert.ok(config.includes("enabled = false"));
  assert.ok(!config.includes("mcp_servers"));
  assert.ok(!config.includes("api_key"));
});

test("runtime selection refuses locations under home or the sandbox temp root", () => {
  assert.throws(() =>
    reviewRuntimeRoot({
      runtimeDir: undefined,
      uid: undefined,
      home: "/home/test",
      temporaryDir: "/tmp",
    })
  );
});

test("the Codex toolchain exception cannot expand to all of home", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-node-home-test-"));
  try {
    const directNodeDir = join(home, "bin");
    const localNodeDir = join(home, ".local", "bin");
    const versionedNodeDir = join(
      home,
      ".nvm",
      "versions",
      "node",
      "v24",
      "bin"
    );
    mkdirSync(directNodeDir, { recursive: true });
    mkdirSync(localNodeDir, { recursive: true });
    mkdirSync(versionedNodeDir, { recursive: true });
    const directNode = join(directNodeDir, "node");
    const localNode = join(localNodeDir, "node");
    const versionedNode = join(versionedNodeDir, "node");
    writeFileSync(directNode, "");
    writeFileSync(localNode, "");
    writeFileSync(versionedNode, "");
    assert.equal(
      reviewToolchainRoot({ nodePath: directNode, home }),
      undefined
    );
    assert.equal(reviewToolchainRoot({ nodePath: localNode, home }), undefined);
    assert.equal(
      reviewToolchainRoot({ nodePath: versionedNode, home }),
      join(home, ".nvm", "versions", "node", "v24")
    );
    assert.equal(
      reviewToolchainRoot({ nodePath: process.execPath, home }),
      undefined
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("isolated CODEX_HOME copies only auth and its read-only config", () => {
  const parentDir = mkdtempSync(join(tmpdir(), "codex-home-parent-"));
  const sourceHome = join(parentDir, "source");
  mkdirSync(sourceHome);
  const auth = join(sourceHome, "auth.json");
  writeFileSync(auth, "fixture-auth");
  chmodSync(auth, 0o600);
  const isolated = createReviewCodexHome({
    sourceHome,
    parentDir,
    workspaceRoot: "/run/user/1000/review",
    pinnedRoot: "/run/user/1000/pin",
    toolchainRoot: null,
  });
  try {
    assert.equal(
      readFileSync(join(isolated.dir, "auth.json"), "utf8"),
      "fixture-auth"
    );
    assert.equal(
      Number.parseInt(
        statSync(join(isolated.dir, "auth.json")).mode.toString(8).slice(-3),
        8
      ),
      0o600
    );
    assert.equal(
      Number.parseInt(
        statSync(join(isolated.dir, "config.toml")).mode.toString(8).slice(-3),
        8
      ),
      0o600
    );
    assert.deepEqual(readdirSync(isolated.dir).sort(), [
      "auth.json",
      "config.toml",
    ]);
    assert.equal(isolated.env.CODEX_HOME, isolated.dir);
    assert.ok(
      readFileSync(join(isolated.dir, "config.toml"), "utf8").includes(
        "enabled = false"
      )
    );
  } finally {
    isolated.release();
    rmSync(parentDir, { recursive: true, force: true });
  }
  assert.equal(existsSync(isolated.dir), false);
});

test("the host-collected review diff is bounded, nonempty and shell-error aware", () => {
  let invocation;
  const spawn = (cmd, args, options) => {
    invocation = { cmd, args, options };
    return { status: 0, stdout: "diff --git a/a b/a\n+line\n" };
  };
  assert.ok(collectReviewDiff("/repo", INFO, spawn).includes("diff --git"));
  assert.equal(invocation.cmd, "git");
  assert.ok(invocation.args.includes("--no-ext-diff"));
  assert.ok(invocation.args.includes("--no-textconv"));
  assert.ok(invocation.args.includes("--no-renames"));
  assert.ok(invocation.args.includes(BASE));
  assert.ok(invocation.args.includes(HEAD));
  assert.throws(() =>
    collectReviewDiff("/repo", INFO, () => ({ status: 0, stdout: "" }))
  );
  assert.throws(() =>
    collectReviewDiff("/repo", INFO, () => ({ status: 1, stdout: "partial" }))
  );
});

test("$ patterns and quoted placeholders in the author's text are copied verbatim", () => {
  const prompt = buildPrompt(INFO, {
    task: "fix the $` bug and $& too",
    criteria: "Acceptance criteria: <fill in>",
  });
  assert.ok(prompt.includes("Task: fix the $` bug and $& too"));
  assert.ok(
    prompt.includes("Acceptance criteria: Acceptance criteria: <fill in>")
  );
});

test("flag rejects a missing value or a following flag", () => {
  assert.equal(flag(["--task", "x"], "--task"), "x");
  assert.equal(flag([], "--task"), undefined);
  assert.throws(() => flag(["--post"], "--post"), NEEDS_VALUE);
  assert.throws(() => flag(["--post", "--dry-run"], "--post"), NEEDS_VALUE);
});

test("posting is blocked for an unpushed head, vault content or a secret", () => {
  assert.deepEqual(postBlockers("No findings.", INFO), []);
  assert.equal(postBlockers("ok", { ...INFO, pushed: false }).length, 1);
  assert.equal(postBlockers("see [[some-note]]", INFO).length, 1);
  assert.equal(postBlockers(`key ${STRIPE_KEY}`, INFO).length, 1);
});

test("posting is blocked when the findings quote a vault path or a token", () => {
  const leaks = [
    "Per /home/eugine/bishop/wiki/05-gaa-client/contract.md the fee is X",
    "see ~/bishop/notes",
    "from raw/02-atmosphere-aviation/report",
    "reads /private/clients.md",
    "bishop/notes/client.md",
    FINE_GRAINED_PAT,
    "See private/clients.md for the agreed fee",
    "in bishop-wt-feature/notes.md",
    "backups/db.sql",
    "grenmet-cleanup-archives/old.tar",
    "token sk-proj-abcdefghijklmnopqrstuvwx leaked",
    "ghs_abcdefghijklmnopqrstuvwxyz0123456789",
    "Authorization: Bearer abcdefghijklmnop1234",
    PEM_HEADER,
  ];
  for (const leak of leaks) {
    assert.ok(postBlockers(leak, INFO).length >= 1, leak);
  }
});

/**
 * A spawn double that records calls. Codex writes `findings` to its out file
 * unless `writesOutput` is false; `throwOn` makes that command throw.
 */
function fakeSpawn({
  codexStatus = 0,
  codexError,
  diffStatus = 0,
  diffOutput = "diff --git a/docs/a.md b/docs/a.md\n+reviewable change\n",
  findings = "No findings.",
  rawOutput,
  authStatus = 0,
  authOutput = "Logged in using ChatGPT",
  reviewStatus = "completed",
  verdict = "approve",
  onReview,
  prHead = HEAD,
  throwOn,
  writesOutput = true,
} = {}) {
  const calls = [];
  const gitDir = mkdtempSync(join(tmpdir(), "codex-receipt-test-"));
  receiptDirs.push(gitDir);
  const state = {
    pinDir: undefined,
    receiptPath: join(gitDir, "agent-review-receipt.json"),
  };
  const spawn = (cmd, args, options = {}) => {
    calls.push({ args, cmd, options });
    if (cmd === throwOn && !(cmd === "codex" && args[0] === "login")) {
      throw new Error(`${cmd} blew up`);
    }
    if (cmd === "git" && args[0] === "rev-parse") {
      return {
        status: 0,
        stdout: args[1] === "--git-dir" ? gitDir : process.cwd(),
      };
    }
    if (cmd === "git" && args[0] === "worktree" && args[1] === "add") {
      state.pinDir = args[3];
    }
    if (cmd === "git" && args[0] === "diff") {
      return { status: diffStatus, stdout: diffOutput };
    }
    if (cmd === "codex") {
      if (args[0] === "login") {
        return { status: authStatus, stdout: authOutput };
      }
      onReview?.();
      if (codexError) {
        return { error: codexError, status: null };
      }
      if (codexStatus === 0 && writesOutput) {
        writeFileSync(
          args[args.indexOf("--output-last-message") + 1],
          rawOutput ??
            JSON.stringify({
              status: reviewStatus,
              verdict,
              summary: findings,
              findings: [],
            })
        );
      }
      assert.equal(options.input.startsWith("Read-only review."), true);
      assert.match(options.input, HOST_COLLECTED_DIFF);
      assert.ok(options.input.includes("reviewable change"));
      return { status: codexStatus };
    }
    if (cmd === "gh" && args[1] === "view") {
      return { status: 0, stdout: `${prHead}\n` };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { calls, spawn, state };
}

const gather =
  (overrides = {}) =>
  () => ({ ...INFO, ...overrides });
const named = (calls, cmd) =>
  calls.filter(
    (call) => call.cmd === cmd && (cmd !== "codex" || call.args[0] === "exec")
  );
const removed = (calls) =>
  calls.filter((c) => c.cmd === "git" && c.args[1] === "remove");
const REVIEW_TMP = /^codex-review-(?!test-)/;
const reviewTempDirs = () =>
  readdirSync(tmpdir()).filter((name) => REVIEW_TMP.test(name));

/** Runs `run`, capturing console.error, and returns code, errors and thrown. */
function runQuiet(args, deps) {
  const errors = [];
  const original = console.error;
  console.error = (message) => errors.push(String(message));
  let code;
  let thrown;
  try {
    code = run(args, {
      runtimeRoot: tmpdir(),
      createReviewCodexHome: () => {
        const dir = mkdtempSync(join(tmpdir(), "codex-review-home-test-"));
        receiptDirs.push(dir);
        return {
          dir,
          env: { ...scrubbedEnv(), CODEX_HOME: dir },
          release() {
            rmSync(dir, { recursive: true, force: true });
          },
        };
      },
      ...deps,
    });
  } catch (error) {
    thrown = error;
  } finally {
    console.error = original;
  }
  return { code, errors, thrown };
}

test("--dry-run starts neither codex nor a worktree nor gh", () => {
  const { calls, spawn } = fakeSpawn();
  assert.equal(run(["--dry-run"], { collect: gather(), spawn }), 0);
  assert.equal(named(calls, "codex").length, 0);
  assert.equal(named(calls, "gh").length, 0);
  assert.equal(
    calls.some((c) => c.args[0] === "worktree"),
    false
  );
});

test("codex runs in a neutral directory with pinned source, and nothing is posted without --post", () => {
  const before = reviewTempDirs();
  const { calls, spawn, state } = fakeSpawn();
  assert.equal(runQuiet([], { collect: gather(), spawn }).code, 0);
  const add = calls.find(
    (c) => c.cmd === "git" && c.args[0] === "worktree" && c.args[1] === "add"
  );
  assert.deepEqual(add.args.slice(0, 3), ["worktree", "add", "--detach"]);
  assert.equal(add.args[4], HEAD);
  const [codex] = named(calls, "codex");
  assert.notEqual(codex.options.cwd, state.pinDir);
  assert.equal(codex.args[codex.args.indexOf("--cd") + 1], codex.options.cwd);
  assert.match(
    codex.options.input,
    new RegExp(state.pinDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.notEqual(codex.options.cwd, process.cwd());
  assert.equal(named(calls, "gh").length, 0);
  assert.equal(existsSync(state.pinDir), false);
  assert.deepEqual(reviewTempDirs(), before);
});

test("--post checks the PR head, then comments once", () => {
  const { calls, spawn } = fakeSpawn();
  assert.equal(runQuiet(["--post", "7"], { collect: gather(), spawn }).code, 0);
  const gh = named(calls, "gh");
  assert.deepEqual(
    gh.map((c) => c.args.slice(0, 3)),
    [
      ["pr", "view", "7"],
      ["pr", "comment", "7"],
    ]
  );
});

test("--post refuses an unpushed head and still cleans up", () => {
  const before = reviewTempDirs();
  const { calls, spawn, state } = fakeSpawn();
  const { code, errors } = runQuiet(["--post", "7"], {
    collect: gather({ pushed: false }),
    spawn,
  });
  assert.equal(code, 1);
  assert.match(errors.join("\n"), NOT_POSTED);
  assert.equal(named(calls, "gh").length, 0);
  assert.equal(existsSync(state.pinDir), false);
  assert.deepEqual(reviewTempDirs(), before);
});

test("--post refuses a PR whose head is not the reviewed head", () => {
  const { calls, spawn } = fakeSpawn({ prHead: "c".repeat(40) });
  const { code, errors } = runQuiet(["--post", "515"], {
    collect: gather(),
    spawn,
  });
  assert.equal(code, 1);
  assert.match(errors.join("\n"), NOT_POSTED);
  assert.equal(
    named(calls, "gh").filter((c) => c.args[1] === "comment").length,
    0
  );
});

test("--post refuses findings that quote a vault path", () => {
  const { calls, spawn } = fakeSpawn({
    findings: "Per /home/eugine/bishop/wiki/05-gaa-client/x.md the fee is X",
  });
  const { code } = runQuiet(["--post", "7"], { collect: gather(), spawn });
  assert.equal(code, 1);
  assert.equal(named(calls, "gh").length, 0);
});

test("--post posts nothing when codex's findings carry a fine-grained token", () => {
  const { calls, spawn } = fakeSpawn({
    findings: `Leaked ${FINE_GRAINED_PAT} in a log`,
  });
  assert.equal(runQuiet(["--post", "7"], { collect: gather(), spawn }).code, 1);
  assert.equal(named(calls, "gh").length, 0);
});

test("the worktree and temp dir are released when codex fails", () => {
  const before = reviewTempDirs();
  const { calls, spawn, state } = fakeSpawn({ codexStatus: 3 });
  assert.equal(runQuiet([], { collect: gather(), spawn }).code, 3);
  assert.equal(removed(calls).length >= 1, true);
  assert.equal(existsSync(state.pinDir), false);
  assert.deepEqual(reviewTempDirs(), before);
});

test("the review lock is released if runtime setup fails", () => {
  const { spawn, state } = fakeSpawn();
  const { thrown } = runQuiet([], {
    collect: gather(),
    runtimeRoot: join(tmpdir(), "codex-review-runtime-missing"),
    spawn,
  });
  assert.ok(thrown);
  assert.equal(existsSync(`${state.receiptPath}.lock`), false);
});

test("codex exiting 0 without an output file is an error, not a crash", () => {
  const before = reviewTempDirs();
  const { spawn, state } = fakeSpawn({ writesOutput: false });
  const { code, errors, thrown } = runQuiet([], { collect: gather(), spawn });
  assert.equal(thrown, undefined);
  assert.equal(code, 1);
  assert.match(errors.join("\n"), NO_FINDINGS);
  assert.equal(existsSync(state.pinDir), false);
  assert.deepEqual(reviewTempDirs(), before);
});

test("a throw while codex runs still releases the worktree and temp dir", () => {
  const before = reviewTempDirs();
  const { spawn, state } = fakeSpawn({ throwOn: "codex" });
  const { thrown } = runQuiet([], { collect: gather(), spawn });
  assert.match(thrown.message, BLEW_UP);
  assert.equal(existsSync(state.pinDir), false);
  assert.deepEqual(reviewTempDirs(), before);
});

test("a missing codex binary says so", () => {
  const { spawn } = fakeSpawn({ codexError: new Error("spawn codex ENOENT") });
  const { code, errors } = runQuiet([], { collect: gather(), spawn });
  assert.equal(code, 1);
  assert.match(errors.join("\n"), COULD_NOT_RUN);
});

test("a missing or malformed flag value exits 2 before any codex run", () => {
  for (const args of [["--post"], ["--post", "abc"], ["--task", "--dry-run"]]) {
    const { calls, spawn } = fakeSpawn();
    assert.equal(runQuiet(args, { collect: gather(), spawn }).code, 2);
    assert.equal(named(calls, "codex").length, 0);
  }
});

test("a successful structured review records exact commits in this worktree", () => {
  const { spawn, state } = fakeSpawn();
  assert.equal(runQuiet([], { collect: gather(), spawn }).code, 0);
  const receipt = readReviewReceipt(state.receiptPath);
  assert.equal(receipt.head, HEAD);
  assert.equal(receipt.mergeBase, BASE);
  assert.equal(receipt.baseTip, BASE);
  assert.equal(receipt.review.status, "completed");
});

test("failed or invalid reruns invalidate a previous approval", () => {
  for (const options of [
    { codexStatus: 3 },
    { rawOutput: "" },
    { rawOutput: "No findings." },
    { rawOutput: '{"status":"completed"}' },
    { authStatus: 1 },
    { diffStatus: 1 },
  ]) {
    const { spawn, state } = fakeSpawn(options);
    writeReviewReceipt(state.receiptPath, { oldApproval: true });
    assert.notEqual(runQuiet([], { collect: gather(), spawn }).code, 0);
    assert.equal(readReviewReceipt(state.receiptPath), null);
  }
});

test("incomplete and changes-requested reviews fail despite a successful CLI exit", () => {
  for (const options of [
    { reviewStatus: "incomplete" },
    { verdict: "changes_requested" },
  ]) {
    const { spawn, state } = fakeSpawn(options);
    assert.equal(runQuiet([], { collect: gather(), spawn }).code, 1);
    assert.ok(readReviewReceipt(state.receiptPath));
  }
});

test("API login cannot start a review and its output is not disclosed", () => {
  const { spawn, calls } = fakeSpawn({
    authOutput: "Logged in using an API key: hidden-value",
  });
  const { code, errors } = runQuiet([], { collect: gather(), spawn });
  assert.equal(code, 1);
  assert.equal(named(calls, "codex").length, 0);
  assert.ok(!errors.join("\n").includes("hidden-value"));
});

test("the review process gets a schema and no inherited API billing variables", () => {
  const { spawn, calls } = fakeSpawn();
  assert.equal(runQuiet([], { collect: gather(), spawn }).code, 0);
  const [review] = named(calls, "codex");
  assert.ok(review.args.includes("--output-schema"));
  assert.ok(!Object.hasOwn(review.options.env, "OPENAI_API_KEY"));
  assert.ok(!Object.hasOwn(review.options.env, "ANTHROPIC_API_KEY"));
});

test("--check is free of model calls and requires current remote and verified commits", () => {
  const { spawn, calls, state } = fakeSpawn();
  const approved = {
    status: "completed",
    verdict: "approve",
    summary: "Reviewed the full diff.",
    findings: [],
  };
  writeReviewReceipt(state.receiptPath, createReviewReceipt(INFO, approved));
  assert.equal(
    runQuiet(["--check"], { collect: gather({ receipt: {} }), spawn }).code,
    0
  );
  assert.equal(named(calls, "codex").length, 0);
  for (const overrides of [
    { head: "c".repeat(40) },
    { baseTip: "c".repeat(40) },
    { remoteVerified: false },
    { pushed: false },
    { dirtyCount: 1 },
    { receipt: null },
  ]) {
    assert.equal(
      runQuiet(["--check"], { collect: gather(overrides), spawn }).code,
      1
    );
  }
});

test("overlapping attempts cannot overwrite a blocking review or accept an in-flight result", () => {
  let secondCode;
  let checkCode;
  const { spawn, calls, state } = fakeSpawn({
    verdict: "changes_requested",
    onReview() {
      secondCode = runQuiet([], { collect: gather(), spawn }).code;
      checkCode = runQuiet(["--check"], {
        collect: gather({ receipt: {} }),
        spawn,
      }).code;
    },
  });
  writeReviewReceipt(
    state.receiptPath,
    createReviewReceipt(INFO, {
      status: "completed",
      verdict: "approve",
      summary: "Prior approval.",
      findings: [],
    })
  );
  assert.equal(runQuiet([], { collect: gather(), spawn }).code, 1);
  assert.equal(secondCode, 1);
  assert.equal(checkCode, 1);
  assert.equal(named(calls, "codex").length, 1);
  assert.equal(
    readReviewReceipt(state.receiptPath).review.verdict,
    "changes_requested"
  );
  assert.equal(existsSync(`${state.receiptPath}.lock`), false);
});
