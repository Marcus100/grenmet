import assert from "node:assert/strict";
import test from "node:test";
import { apiTestTargets, planChecks } from "./changed.mjs";

const TEST_FILES = ["cap/", "hr/", "conftest.py", "test_eregister_public.py"];
const names = (checks) => checks.map((check) => check.name);
const find = (checks, name) => checks.find((check) => check.name === name);

test("docs-only change runs doc gates and nothing heavier", () => {
  const checks = planChecks(["docs/agents/primitives.md"]);
  assert.deepEqual(names(checks), ["doc links", "doc tests"]);
});

test("web change formats its files and runs affected turbo tasks", () => {
  const checks = planChecks(["apps/web/gms/src/app/page.tsx", "README.md"]);
  assert.deepEqual(find(checks, "format+lint").args.slice(-1), [
    "apps/web/gms/src/app/page.tsx",
  ]);
  for (const task of ["type-check", "test"])
    assert.deepEqual(find(checks, task).args, [
      "turbo",
      "run",
      task,
      "--affected",
    ]);
});

test("API domain change runs lint and only that domain's tests", () => {
  const checks = planChecks(["apps/api/fastapi/src/hr/service.py"], {
    testFiles: TEST_FILES,
  });
  assert.ok(names(checks).includes("api lint+types"));
  assert.deepEqual(find(checks, "api tests").args.slice(-1), ["tests/hr"]);
  assert.ok(!names(checks).includes("api client drift"));
});

test("API contract change adds drift and blast-radius checks", () => {
  const checks = planChecks(["apps/api/fastapi/src/cap/router.py"], {
    base: "abc123",
    testFiles: TEST_FILES,
  });
  assert.ok(names(checks).includes("api client drift"));
  assert.ok(names(checks).includes("risk tier"));
  assert.deepEqual(find(checks, "blast radius").args.slice(-4), [
    "--base",
    "abc123",
    "--head",
    "HEAD",
  ]);
});

test("shared API module or conftest change runs the full API suite", () => {
  for (const file of ["src/dependencies.py", "tests/conftest.py"]) {
    const checks = planChecks([`apps/api/fastapi/${file}`], {
      testFiles: TEST_FILES,
    });
    assert.deepEqual(find(checks, "api tests").args.slice(-2), [
      "pytest",
      "-q",
    ]);
  }
});

test("flat domain test files are found by prefix", () => {
  assert.deepEqual(apiTestTargets("eregister", TEST_FILES), [
    "tests/test_eregister_public.py",
  ]);
  assert.deepEqual(apiTestTargets("billing", TEST_FILES), []);
});

test("agent configuration changes run guardrails", () => {
  for (const file of [
    "AGENTS.md",
    "apps/web/gms/AGENTS.md",
    ".claude/skills/commit/SKILL.md",
    ".github/workflows/ci-web.yml",
  ])
    assert.ok(names(planChecks([file])).includes("guardrails"), file);
});

test("no changes plan no checks", () => {
  assert.deepEqual(planChecks([]), []);
});

test("deleted files still plan checks but are never formatted", () => {
  const checks = planChecks(
    ["apps/web/docs/src/components/icons/BellIcon.tsx"],
    { deleted: ["apps/web/docs/src/components/icons/BellIcon.tsx"] }
  );
  assert.deepEqual(names(checks), ["type-check", "test"]);
});
