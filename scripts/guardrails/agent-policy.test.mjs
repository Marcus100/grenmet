// The git policy agents act on (where work lands, who merges, what has
// standing authorization) is stated in several files that each tool reads on
// its own: the root AGENTS.md, the workflow and roles docs, the release
// runbook and the commit and release skills. They drifted once: roles.md
// suspended an authorization that the commit and release skills still
// granted, and a skill's failure path still said to push dev. This keeps
// every statement on the same policy and keeps the ruleset snapshot that
// enforces part of it present and wired into CI.

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
  // These restate part of the policy (how flow is measured, how the hooks
  // enforce it, what the commit skill should do), so they must not drift back.
  "docs/agents/factory.md",
  "docs/agent-configuration-guide.md",
  ".claude/skills/commit/evals/triggers.md",
];
// Files that state the whole landing and promotion policy, not just part of it.
const PARTIAL_POLICY_FILES = [
  "docs/agents/routines.md",
  "docs/agents/factory.md",
  "docs/agent-configuration-guide.md",
  ".claude/skills/commit/evals/triggers.md",
];
const FULL_POLICY_FILES = POLICY_FILES.filter(
  (file) => !PARTIAL_POLICY_FILES.includes(file)
);
// Retired wording, each paired with what replaced it. "push dev" is retired in
// every affirmative form; a negated form ("never push dev") states the policy.
const RETIRED = [
  [
    /push `dev` directly/,
    "agents open a PR into `dev` and merge it once CI is green and the review is clean",
  ],
  [
    /(?<!never |not )push(?:es|ing)? (?:`dev`|dev)\b/i,
    "agents open a PR into `dev` and merge it once CI is green and the review is clean",
  ],
  [
    /direct (?:`dev`|dev) push/i,
    "agents open a PR into `dev` and merge it once CI is green and the review is clean",
  ],
  [
    /merges? (?:(?:the |all |any )?(?:completed |finished |task )*branch(?:es)? )?into (?:a |the )?local `?dev`?/i,
    "the task branch is pushed and lands by PR into `dev`",
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
const AGENTS_MERGE_WHEN_GREEN = /CI\s+is\s+green[^.]*review/i;
const STANDING_AUTHORIZATION = /standing (?:user )?authori[sz]ation/i;
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
      const match = text.match(pattern);
      assert.equal(
        match,
        null,
        `${file} still says "${match?.[0]}"; the policy is now: ${replacement}`
      );
    }
  }
});

test("the retired-wording patterns catch affirmative variants and allow negated ones", () => {
  const affirmative = [
    "validate and push dev again.",
    "merges the task branch into local dev, pushes dev and arms",
    "then push `dev` directly.",
    "after a direct dev push,",
    "Merge completed task branches into local `dev`",
    "then merge completed branches into local `dev` in a clean checkout",
    "merges branches into local dev instead of opening PRs",
    "merges into local dev, pushes dev and arms the staging promotion",
  ];
  const negated = [
    "agents never push `dev` or merge into it themselves.",
    "never push `dev` yourself.",
    "Never push `dev`, `staging` or `main`.",
    "no agent merges into `dev` or pushes it.",
  ];
  const retired = (text) => RETIRED.some(([pattern]) => pattern.test(text));
  for (const text of affirmative) assert.ok(retired(text), text);
  for (const text of negated) assert.equal(retired(text), false, text);
});

test("every full policy file states the complete landing and promotion policy", () => {
  const required = [
    [LANDS_BY_PR, "work lands by PR into dev"],
    [
      AGENTS_MERGE_WHEN_GREEN,
      "agents merge into dev once CI is green and the review is clean",
    ],
    [STANDING_AUTHORIZATION, "staging promotion has standing authorization"],
    [
      PROMOTES_BY_AUTO_MERGE,
      "staging promotion mentions auto-merge (the owner merges; agents do not arm it)",
    ],
    [LIMITS_PRODUCTION, "main and production need explicit authorization"],
  ];
  for (const file of FULL_POLICY_FILES) {
    const text = read(file);
    for (const [pattern, meaning] of required) {
      assert.match(text, pattern, `${file}: ${meaning}`);
    }
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
