import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildArgs,
  buildPrompt,
  flag,
  pinHead,
  postBlockers,
  run,
} from "./codex-review.mjs";

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

test("the codex session is read-only, ephemeral and takes the prompt on stdin", () => {
  const args = buildArgs("/repo", "/tmp/out.md");
  assert.deepEqual(args.slice(0, 4), [
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
  ]);
  assert.equal(args.at(-1), "-");
  assert.ok(!args.some((arg) => arg.includes("dangerously")));
  assert.ok(!args.includes("--full-auto"));
});

test("the prompt names the exact head and base and the author's fields", () => {
  const prompt = buildPrompt(INFO, {
    task: "Add the thing",
    criteria: "It does the thing",
  });
  assert.match(prompt, HEADER);
  assert.match(prompt, TASK_LINE);
  assert.match(prompt, CRITERIA_LINE);
  assert.match(prompt, new RegExp(`git diff ${BASE}\\.\\.${HEAD}`));
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

test("user config, and so the private MCP servers, is ignored", () => {
  assert.ok(buildArgs("/repo", "/tmp/out.md").includes("--ignore-user-config"));
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
  findings = "No findings.",
  prHead = HEAD,
  throwOn,
  writesOutput = true,
} = {}) {
  const calls = [];
  const state = { pinDir: undefined };
  const spawn = (cmd, args, options = {}) => {
    calls.push({ args, cmd, options });
    if (cmd === throwOn) {
      throw new Error(`${cmd} blew up`);
    }
    if (cmd === "git" && args[0] === "rev-parse") {
      return { status: 0, stdout: process.cwd() };
    }
    if (cmd === "git" && args[0] === "worktree" && args[1] === "add") {
      state.pinDir = args[3];
    }
    if (cmd === "codex") {
      if (codexError) {
        return { error: codexError, status: null };
      }
      if (codexStatus === 0 && writesOutput) {
        writeFileSync(
          args[args.indexOf("--output-last-message") + 1],
          findings
        );
      }
      assert.equal(options.input.startsWith("Read-only review."), true);
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
const named = (calls, cmd) => calls.filter((call) => call.cmd === cmd);
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
    code = run(args, deps);
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

test("codex runs in a pinned checkout of the head, and nothing is posted without --post", () => {
  const before = reviewTempDirs();
  const { calls, spawn, state } = fakeSpawn();
  assert.equal(runQuiet([], { collect: gather(), spawn }).code, 0);
  const add = calls.find(
    (c) => c.cmd === "git" && c.args[0] === "worktree" && c.args[1] === "add"
  );
  assert.deepEqual(add.args.slice(0, 3), ["worktree", "add", "--detach"]);
  assert.equal(add.args[4], HEAD);
  const [codex] = named(calls, "codex");
  assert.equal(codex.options.cwd, state.pinDir);
  assert.equal(codex.args[codex.args.indexOf("--cd") + 1], state.pinDir);
  assert.notEqual(state.pinDir, process.cwd());
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
