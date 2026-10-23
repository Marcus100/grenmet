import assert from "node:assert/strict";
import test from "node:test";
import { buildArgs, buildPrompt } from "./codex-review.mjs";

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
