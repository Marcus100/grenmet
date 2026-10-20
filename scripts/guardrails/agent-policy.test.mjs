// The git policy agents act on (where work lands, who merges, what has
// standing authorization) is stated in several files that each tool reads on
// its own: the root AGENTS.md, the workflow and roles docs, the release
// runbook and the commit and release skills. They drifted once: roles.md
// suspended an authorization that the commit and release skills still
// granted. This keeps every statement on the same policy and keeps the ruleset
// snapshot that enforces part of it present and wired into CI.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) =>
  readFileSync(join(repoRoot, relativePath), "utf8");

const POLICY_FILES = [
  "AGENTS.md",
  "docs/agents/workflow.md",
  "docs/agents/roles.md",
  "docs/agents/routines.md",
  "docs/operations/release-runbook.md",
  ".claude/skills/commit/SKILL.md",
  ".claude/skills/release/SKILL.md",
];
// Files that state the whole landing and promotion policy, not just part of it.
const FULL_POLICY_FILES = POLICY_FILES.filter(
  (file) => !["docs/agents/routines.md"].includes(file)
);
// Retired wording, each paired with what replaced it.
const RETIRED = [
  [/push `dev` directly/, "agents open a PR into `dev`; the owner merges"],
  [
    /direct (?:`dev`|dev) push/i,
    "agents open a PR into `dev`; the owner merges",
  ],
  [
    /Do not push feature branches/,
    "pushing the task branch is the normal path",
  ],
  [/feature-to-dev PRs? unless/, "a PR into `dev` is the normal path"],
  [
    /overrides the attended-session standing authorization/,
    "dev → staging promotion keeps its standing authorization",
  ],
];
const LANDS_BY_PR = /(?:PR|pull request)s? (?:in)?to `dev`/;
const PROMOTES_BY_AUTO_MERGE = /auto-merge/;
const LIMITS_PRODUCTION = /(?:explicit|separate)[^.]*authori[sz]ation/i;
const DRIFT_WORKFLOW_RUNS_CHECK =
  /scripts\/guardrails\/github-rulesets\.mjs --check/;
const DRIFT_WORKFLOW_BRANCHES = /branches: \[main, staging, dev\]/;
const SNAPSHOT_MENTION = /infra\/github\/rulesets\.json/;

test("no policy file still states retired git policy", () => {
  for (const file of POLICY_FILES) {
    const text = read(file);
    for (const [pattern, replacement] of RETIRED) {
      assert.doesNotMatch(
        text,
        pattern,
        `${file} still says ${pattern}; the policy is now: ${replacement}`
      );
    }
  }
});

test("every full policy file states landing by PR, staging auto-merge and the production limit", () => {
  for (const file of FULL_POLICY_FILES) {
    const text = read(file);
    assert.match(text, LANDS_BY_PR, `${file}: work lands by PR into dev`);
    assert.match(
      text,
      PROMOTES_BY_AUTO_MERGE,
      `${file}: staging promotion by auto-merge`
    );
    assert.match(
      text,
      LIMITS_PRODUCTION,
      `${file}: main and production need explicit authorization`
    );
  }
});

test("the ruleset snapshot exists and is wired into CI and pnpm", () => {
  assert.ok(existsSync(join(repoRoot, "infra/github/rulesets.json")));
  const workflow = read(".github/workflows/rulesets-drift.yml");
  assert.match(workflow, DRIFT_WORKFLOW_RUNS_CHECK);
  assert.match(workflow, DRIFT_WORKFLOW_BRANCHES);
  const scripts = JSON.parse(read("package.json")).scripts;
  assert.equal(
    scripts["guardrails:rulesets"],
    "node scripts/guardrails/github-rulesets.mjs --check"
  );
  assert.equal(
    scripts["agents:handoff"],
    "node scripts/agents/review-handoff.mjs"
  );
  assert.match(read("docs/agents/workflow.md"), SNAPSHOT_MENTION);
});
