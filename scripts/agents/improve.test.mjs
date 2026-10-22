import assert from "node:assert/strict";
import test from "node:test";
import { collectProblems, formatBrief } from "./improve.mjs";

const DID_NOT_TRIGGER_RE = /did not trigger on: CI is red/;
const PARAPHRASE_IT_NEVER_RE = /Paraphrase it; never paste it/;
const SCORER_RULE_VIOLATION_RE = /\| scorer \| rule-violation \| 2 \| 2 \|/;
const SCOPE_CREEP_RE = /scope-creep/;
const SESSION_ABCDEF_RE = /session abcdef12/;
const NOTHING_TO_PROPOSE_RE = /Nothing to propose/;

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
