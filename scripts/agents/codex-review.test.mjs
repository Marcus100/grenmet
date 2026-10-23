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
import { buildArgs, buildPrompt, pinHead } from "./codex-review.mjs";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
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
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
