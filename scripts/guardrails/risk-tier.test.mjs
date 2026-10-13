import assert from "node:assert/strict";
import test from "node:test";
import { riskTier } from "./risk-tier.mjs";

const tier = (...files) => riskTier(files).tier;

test("docs, skills and tests only are low risk", () => {
  assert.equal(tier("docs/agents/routines.md"), "low");
  assert.equal(tier(".claude/skills/commit/SKILL.md", "README.md"), "low");
  assert.equal(tier("apps/api/fastapi/tests/hr/test_leave.py"), "low");
  assert.equal(tier("apps/web/gms/src/lib/cms.test.ts"), "low");
});

test("ordinary source changes are standard", () => {
  assert.equal(tier("apps/web/gms/src/app/page.tsx"), "standard");
  assert.equal(tier("apps/api/fastapi/src/hr/service.py"), "standard");
  assert.equal(tier("docs/x.md", "packages/ui/src/lib/utils.ts"), "standard");
});

test("security, data, delivery and dependency surfaces are high", () => {
  for (const file of [
    "apps/api/fastapi/src/auth/policy.py",
    "apps/api/fastapi/src/auth/permissions.py",
    "apps/api/fastapi/alembic/versions/0001_x.py",
    "apps/api/fastapi/src/wxwatch/migrations/versions/0002_y.py",
    "packages/auth/src/server/session.ts",
    "apps/web/auth/src/app/page.tsx",
    ".github/workflows/ci-web.yml",
    "infra/docker/docker-compose.prod.yml",
    "apps/web/gms/Dockerfile",
    ".claude/hooks/protect-files.mjs",
    ".codex/config.toml",
    "package.json",
    "apps/web/gms/package.json",
    "uv.lock",
    "turbo.json",
    "scripts/guardrails/suppression-baseline.json",
  ])
    assert.equal(tier(file), "high", file);
});

test("one high-risk file makes the whole change high and names it", () => {
  const result = riskTier(["docs/x.md", "uv.lock"]);
  assert.equal(result.tier, "high");
  assert.deepEqual(result.reasons, ["dependencies: uv.lock"]);
});

test("an empty change is standard, never low", () => {
  assert.equal(tier(), "standard");
});
