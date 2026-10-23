import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
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
  assert.equal(postBlockers("key sk_live_abcdefgh12345", INFO).length, 1);
});

/** A spawn double that records calls; codex writes `findings` to its out file. */
function fakeSpawn({ codexStatus = 0, findings = "No findings." } = {}) {
  const calls = [];
  const spawn = (cmd, args, options = {}) => {
    calls.push({ args, cmd });
    if (cmd === "git" && args[0] === "rev-parse") {
      return { status: 0, stdout: process.cwd() };
    }
    if (cmd === "codex") {
      if (codexStatus === 0) {
        writeFileSync(
          args[args.indexOf("--output-last-message") + 1],
          findings
        );
      }
      assert.equal(options.input.startsWith("Read-only review."), true);
      return { status: codexStatus };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { calls, spawn };
}

const gather =
  (overrides = {}) =>
  () => ({ ...INFO, ...overrides });
const named = (calls, cmd) => calls.filter((call) => call.cmd === cmd);
const removed = (calls) =>
  calls.filter((c) => c.cmd === "git" && c.args[1] === "remove");

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

test("nothing is posted without --post", () => {
  const { calls, spawn } = fakeSpawn();
  assert.equal(run([], { collect: gather(), spawn }), 0);
  assert.equal(named(calls, "codex").length, 1);
  assert.equal(named(calls, "gh").length, 0);
});

test("--post comments once when the head is pushed and the findings are clean", () => {
  const { calls, spawn } = fakeSpawn();
  assert.equal(run(["--post", "7"], { collect: gather(), spawn }), 0);
  const [gh] = named(calls, "gh");
  assert.deepEqual(gh.args.slice(0, 3), ["pr", "comment", "7"]);
});

test("--post refuses an unpushed head and still cleans up", () => {
  const { calls, spawn } = fakeSpawn();
  const code = run(["--post", "7"], {
    collect: gather({ pushed: false }),
    spawn,
  });
  assert.equal(code, 1);
  assert.equal(named(calls, "gh").length, 0);
  assert.equal(removed(calls).length >= 1, true);
});

test("the worktree is released when codex fails", () => {
  const { calls, spawn } = fakeSpawn({ codexStatus: 3 });
  assert.equal(run([], { collect: gather(), spawn }), 3);
  assert.equal(removed(calls).length >= 1, true);
});

test("a missing value for a flag exits 2 before any codex run", () => {
  const { calls, spawn } = fakeSpawn();
  assert.equal(run(["--post"], { collect: gather(), spawn }), 2);
  assert.equal(named(calls, "codex").length, 0);
});
