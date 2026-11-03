import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { tasks } = JSON.parse(
  readFileSync(join(root, "docs/agents/benchmarks/tasks.json"), "utf8")
);
const KINDS = [
  "feature",
  "fix",
  "refactor",
  "cleanup",
  "docs",
  "adversarial",
  "rules",
];
const SOURCES = ["history", "open-issue", "adversarial", "rules"];
const TIERS = ["low", "standard", "high"];
const ID = /^bm-\d{2}$/u;
const SHA = /^[0-9a-f]{8}$/u;
const TASK_COUNT = 25;
const MIN_ADVERSARIAL = 3;

const git = (...args) =>
  spawnSync("git", args, { cwd: root, encoding: "utf8" });
// Shallow clones (CI) lack the history the specs point at, so skip those checks.
const hasHistory =
  git("rev-parse", "--is-shallow-repository").stdout.trim() === "false";
const exists = (sha) => git("cat-file", "-e", `${sha}^{commit}`).status === 0;

test("the benchmark has twenty-five uniquely numbered tasks", () => {
  assert.equal(tasks.length, TASK_COUNT);
  assert.equal(new Set(tasks.map((t) => t.id)).size, TASK_COUNT);
  tasks.forEach((task, index) => {
    assert.match(task.id, ID);
    assert.equal(task.id, `bm-${String(index + 1).padStart(2, "0")}`);
  });
});

test("every task has the required fields with valid values", () => {
  for (const task of tasks) {
    assert.ok(KINDS.includes(task.kind), `${task.id} kind`);
    assert.ok(SOURCES.includes(task.source), `${task.id} source`);
    assert.ok(TIERS.includes(task.expected_tier), `${task.id} tier`);
    assert.ok([1, 2, 3].includes(task.difficulty), `${task.id} difficulty`);
    assert.ok(task.title.length > 0 && task.prompt.length > 40, task.id);
    assert.match(task.base, SHA, `${task.id} base`);
    assert.ok(Array.isArray(task.hidden_tests), `${task.id} hidden_tests`);
    assert.ok(task.expected_checks.length > 0, `${task.id} checks`);
  }
});

test("the mix covers real fixes, open issues and adversarial traps", () => {
  const count = (source) => tasks.filter((t) => t.source === source).length;
  assert.ok(count("history") >= 10);
  assert.ok(count("open-issue") >= 3);
  assert.ok(count("adversarial") >= MIN_ADVERSARIAL);
  for (const task of tasks.filter((t) => t.source === "adversarial")) {
    assert.equal(task.kind, "adversarial");
    assert.ok(task.expected_outcome, `${task.id} needs an expected_outcome`);
  }
});

test("history tasks name a solution and open or adversarial tasks do not", () => {
  for (const task of tasks) {
    if (task.source === "history") {
      assert.match(task.solution, SHA, `${task.id} solution`);
      assert.ok(task.solution_subject, `${task.id} subject`);
    } else assert.equal(task.solution, null, `${task.id} has no solution`);
  }
});

test("prompts never leak the solution commit's wording", () => {
  for (const task of tasks.filter((t) => t.solution_subject)) {
    assert.ok(
      !task.prompt.includes(task.solution_subject),
      `${task.id} prompt contains the solution subject`
    );
  }
});

test("base and solution commits exist and the subject and hidden tests match", (t) => {
  if (!hasHistory) {
    t.skip("shallow clone: benchmark history is not available");
    return;
  }
  for (const task of tasks.filter((x) => x.source === "history")) {
    if (!(exists(task.base) && exists(task.solution))) {
      t.skip(`${task.id}: commits not present in this clone`);
      return;
    }
    const subject = git(
      "log",
      "-1",
      "--format=%s",
      task.solution
    ).stdout.trim();
    assert.equal(subject, task.solution_subject, `${task.id} subject`);
    for (const path of task.hidden_tests)
      assert.equal(
        git("cat-file", "-e", `${task.solution}:${path}`).status,
        0,
        `${task.id}: ${path} missing from the solution commit`
      );
  }
});
