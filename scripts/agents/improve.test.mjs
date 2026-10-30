import assert from "node:assert/strict";
import test from "node:test";
import { collectProblems, formatBrief } from "./improve.mjs";

const DID_NOT_TRIGGER_RE = /did not trigger on: CI is red/u;
const PARAPHRASE_IT_NEVER_RE = /Paraphrase it; never paste it/u;
const SCORER_RULE_VIOLATION_RE = /\| scorer \| rule-violation \| 2 \| 2 \|/u;
const SCOPE_CREEP_RE = /scope-creep/u;
const SESSION_ABCDEF_RE = /session abcdef12/u;
const NOTHING_TO_PROPOSE_RE = /Nothing to propose/u;
const ROSTER_MISS_RE = /^did not trigger on: The roster endpoint/u;
const REBASE_MISS_RE = /^did not trigger on: Rebase stopped/u;
const WRONG_TRIGGER_RE = /^triggered wrongly on: Rebase stopped/u;

const score = (scorer, verdict, extra = {}) => ({
  evidence: `${scorer} ${verdict}`,
  scorer,
  session: "abcdef123456",
  suggestion: "add a rule",
  verdict,
  ...extra,
});

test("collectProblems groups failures by scorer, skill and friction area", () => {
  const problems = collectProblems({
    friction: [
      {
        labels: [{ name: "friction" }, { name: "area:web" }],
        number: 1,
        title: "slow gate",
      },
      { labels: [{ name: "area:web" }], number: 2, title: "flaky test" },
      { labels: [], number: 3, title: "no area" },
    ],
    scores: [
      score("verification-skipped", "fail"),
      score("verification-skipped", "fail"),
      score("verification-skipped", "pass"),
      score("verification-skipped", "n/a"),
      score("scope-creep", "pass"),
    ],
    skillEvals: [
      {
        expect: "trigger",
        passed: false,
        prompt: "CI is red",
        skill: "ci-triage",
      },
      {
        expect: "trigger",
        passed: true,
        prompt: "Type check failed",
        skill: "ci-triage",
      },
    ],
  });
  const keys = problems.map(
    (p) => `${p.source}:${p.key}:${p.count}/${p.checked}`
  );
  assert.deepEqual(keys, [
    "friction:area:web:2/2",
    "scorer:verification-skipped:2/3",
    "friction:area:none:1/1",
    "skill-trigger:ci-triage:1/2",
  ]);
  assert.match(problems[3].examples[0].evidence, DID_NOT_TRIGGER_RE);
});

test("formatBrief lists only repeated problems and warns about evidence", () => {
  const problems = collectProblems({
    scores: [
      score("rule-violation", "fail"),
      score("rule-violation", "fail"),
      score("scope-creep", "fail"),
    ],
  });
  const brief = formatBrief(problems, { days: 30, min: 2 });
  assert.match(brief, PARAPHRASE_IT_NEVER_RE);
  assert.match(brief, SCORER_RULE_VIOLATION_RE);
  assert.doesNotMatch(brief, SCOPE_CREEP_RE);
  assert.match(brief, SESSION_ABCDEF_RE);
  assert.match(formatBrief([], { days: 7, min: 3 }), NOTHING_TO_PROPOSE_RE);
});

const evalRow = (date, passed, extra = {}) => ({
  agent: "claude",
  date,
  expect: "trigger",
  fired: passed ? ["ci-triage"] : [],
  model: "claude-haiku-5-5",
  passed,
  prompt: "Some checks are failing on the open PR, what broke?",
  skill: "ci-triage",
  ...extra,
});

test("only the latest result of each eval case counts", () => {
  const problems = collectProblems({
    skillEvals: [
      evalRow("2026-10-21T17:38:00Z", false),
      evalRow("2026-10-21T17:42:00Z", false),
      evalRow("2026-10-21T17:54:00Z", true),
      evalRow("2026-10-21T17:38:00Z", false, { prompt: "Why did x.yml fail?" }),
      evalRow("2026-10-21T17:54:00Z", false, { prompt: "Why did x.yml fail?" }),
    ],
  });
  const [ciTriage] = problems.filter((p) => p.source === "skill-trigger");
  assert.equal(ciTriage.key, "ci-triage");
  assert.equal(ciTriage.count, 1);
  assert.equal(ciTriage.checked, 2);
});

test("a json case is filed under the skill it missed or fired wrongly", () => {
  const json = (prompt, fired, shouldUse) =>
    evalRow("2026-10-21T17:54:00Z", false, {
      expect: "json",
      fired,
      prompt,
      should_not_use: ["ci-triage"],
      should_use: [shouldUse],
      skill: "(json cases)",
    });
  const problems = collectProblems({
    skillEvals: [
      json("The roster endpoint got slow, diagnose it.", [], "diagnosing-bugs"),
      json("Rebase stopped on openapi.json.", ["ci-triage"], "ci-triage-x"),
    ],
  });
  const byKey = Object.fromEntries(problems.map((p) => [p.key, p]));
  assert.equal(byKey["(json cases)"], undefined);
  assert.match(byKey["diagnosing-bugs"].examples[0].evidence, ROSTER_MISS_RE);
  assert.match(byKey["ci-triage-x"].examples[0].evidence, REBASE_MISS_RE);
});

test("a json case that misses and wrongly fires counts every skill", () => {
  const problems = collectProblems({
    skillEvals: [
      evalRow("2026-10-21T17:54:00Z", false, {
        expect: "json",
        fired: ["ci-triage"],
        prompt: "Rebase stopped on openapi.json.",
        should_not_use: ["ci-triage"],
        should_use: ["resolving-merge-conflicts", "commit"],
        skill: "(json cases)",
      }),
    ],
  });
  const summary = problems
    .map((p) => `${p.key}:${p.count}/${p.checked}`)
    .sort();
  assert.deepEqual(summary, [
    "ci-triage:1/1",
    "commit:1/1",
    "resolving-merge-conflicts:1/1",
  ]);
});

test("a json case that also fired a forbidden skill is a wrong trigger", () => {
  const problems = collectProblems({
    skillEvals: [
      evalRow("2026-10-21T17:54:00Z", false, {
        expect: "json",
        fired: ["ci-triage", "resolving-merge-conflicts"],
        prompt: "Rebase stopped on openapi.json.",
        should_not_use: ["ci-triage"],
        should_use: ["resolving-merge-conflicts"],
        skill: "(json cases)",
      }),
    ],
  });
  const [problem] = problems;
  assert.equal(problem.key, "ci-triage");
  assert.match(problem.examples[0].evidence, WRONG_TRIGGER_RE);
});
