import assert from "node:assert/strict";
import test from "node:test";
import { apiTestTargets, planChecks } from "./changed.mjs";

const HR_TESTS = /pytest -q tests\/hr$/;
const FULL_SUITE = /pytest -q$/;
const SETTINGS_FILE = /pytest -q tests\/test_settings\.py$/;
const LINT_TESTS =
  /ruff check src scripts tests .*ruff format src scripts tests --check/;
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
  assert.match(find(checks, "api tests").args.at(-1), HR_TESTS);
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

test("shared API module or test infrastructure change runs the full API suite", () => {
  for (const file of [
    "src/dependencies.py",
    "tests/conftest.py",
    "tests/factories.py",
  ]) {
    const checks = planChecks([`apps/api/fastapi/${file}`], {
      testFiles: TEST_FILES,
    });
    assert.match(find(checks, "api tests").args.at(-1), FULL_SUITE);
  }
});

test("main.py change runs the core subset, not the full suite", () => {
  const checks = planChecks(["apps/api/fastapi/src/main.py"], {
    testFiles: TEST_FILES,
  });
  const command = find(checks, "api tests").args.at(-1);
  assert.doesNotMatch(command, FULL_SUITE);
  for (const target of [
    "tests/test_startup_imports.py",
    "tests/test_openapi_contract.py",
    "tests/test_settings.py",
  ])
    assert.ok(command.includes(target), target);
  assert.ok(names(checks).includes("api client drift"));
});

test("dependency changes run API lint and the full suite", () => {
  for (const file of [
    "uv.lock",
    "apps/api/fastapi/pyproject.toml",
    "apps/api/fastapi/uv.lock",
  ]) {
    const checks = planChecks([file], { testFiles: TEST_FILES });
    assert.ok(names(checks).includes("api lint+types"), file);
    assert.match(find(checks, "api tests").args.at(-1), FULL_SUITE);
  }
});

test("test-only changes lint tests and run just that directory or file", () => {
  const dir = planChecks(["apps/api/fastapi/tests/hr/test_leave.py"], {
    testFiles: TEST_FILES,
  });
  assert.match(find(dir, "api tests").args.at(-1), HR_TESTS);
  const file = planChecks(["apps/api/fastapi/tests/test_settings.py"], {
    testFiles: TEST_FILES,
  });
  assert.match(find(file, "api tests").args.at(-1), SETTINGS_FILE);
  for (const checks of [dir, file])
    assert.match(find(checks, "api lint+types").args.at(-1), LINT_TESTS);
});

test("API commands run through the local-environment wrapper", () => {
  const checks = planChecks(["apps/api/fastapi/src/hr/service.py"], {
    testFiles: TEST_FILES,
  });
  for (const name of ["api lint+types", "api tests"])
    assert.equal(
      find(checks, name).command,
      "../../../scripts/agents/api-env.sh"
    );
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

test("source changes run guardrails so the suppression ratchet is checked locally", () => {
  for (const file of [
    "notebooks/tests/test_forecast_metadata.py",
    "apps/api/fastapi/src/hr/service.py",
    "apps/web/mbia/src/app/page.tsx",
    "scripts/verification/changed.mjs",
  ])
    assert.ok(names(planChecks([file])).includes("guardrails"), file);
});

test("guardrails are planned once even when several rules want them", () => {
  const checks = names(
    planChecks(["AGENTS.md", "apps/web/mbia/src/app/page.tsx"])
  );
  assert.equal(checks.filter((name) => name === "guardrails").length, 1);
});

test("a deleted source file alone does not add guardrails", () => {
  const file = "apps/web/docs/src/components/icons/BellIcon.tsx";
  assert.ok(
    !names(planChecks([file], { deleted: [file] })).includes("guardrails")
  );
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

test("root governance documents run the portfolio coverage check", () => {
  for (const file of ["SECURITY.md", "VENDORED.md", "CONTEXT.md"])
    assert.ok(names(planChecks([file])).includes("portfolio coverage"), file);
  assert.ok(
    !names(planChecks(["docs/hr/policy-rules.md"])).includes(
      "portfolio coverage"
    )
  );
});

test("changes under governed parents run the portfolio coverage check", () => {
  for (const file of [
    "scripts/agents/new-tool.mjs",
    "packages/ui/src/lib/utils.ts",
    "docs/portfolio/repository-delivery-map.md",
  ])
    assert.ok(names(planChecks([file])).includes("portfolio coverage"), file);
  assert.ok(
    !names(planChecks(["docs/agents/journal.md"])).includes(
      "portfolio coverage"
    )
  );
});

test("web UI changes in apps with smoke tests plan the e2e check", () => {
  for (const file of [
    "apps/web/gms/src/app/(pages)/about/page.tsx",
    "apps/web/gaa-admin/src/proxy.ts",
    "apps/web/gms/e2e/smoke.spec.ts",
  ])
    assert.ok(names(planChecks([file])).includes("e2e smoke"), file);
  for (const file of [
    "apps/web/mbia/src/app/page.tsx",
    "docs/web/development.md",
  ])
    assert.ok(!names(planChecks([file])).includes("e2e smoke"), file);
});
