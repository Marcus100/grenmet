// Trigger evals (pattern from the Bishop vault): every skill has a realistic
// prompt that should select it, plus a confusable skill that should not. The
// file is the input for model-graded trigger runs; this test keeps it in sync.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const skills = new Set(
  readdirSync(join(root, ".claude/skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
);
const cases = JSON.parse(
  readFileSync(join(root, "scripts/agents/skill-trigger-evals.json"), "utf8")
);

test("trigger evals only name existing skills and never contradict", () => {
  for (const [index, item] of cases.entries()) {
    assert.ok(item.prompt, `case ${index + 1}: missing prompt`);
    for (const name of [...item.should_use, ...item.should_not_use]) {
      assert.ok(skills.has(name), `case ${index + 1}: unknown skill ${name}`);
    }
    const both = item.should_use.filter((name) =>
      item.should_not_use.includes(name)
    );
    assert.deepEqual(both, [], `case ${index + 1}: required and forbidden`);
  }
});

test("every skill has a positive trigger case", () => {
  const covered = new Set(cases.flatMap((item) => item.should_use));
  assert.deepEqual(
    [...skills].filter((name) => !covered.has(name)),
    []
  );
});
