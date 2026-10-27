#!/usr/bin/env node
// The self-improvement brief: groups the factory's repeated failures so an agent
// (the factory-improve skill) can propose a fix to the factory itself — a
// skill, an AGENTS.md rule, a check — instead of fixing each symptom.
//
// Sources, all local or public:
//   scorer verdicts       ~/.cache/grenmet-factory/scores.jsonl (score-sessions.mjs)
//   skill trigger evals   ~/.cache/grenmet-skill-evals/results.jsonl (skill-evals.mjs)
//   friction issues       open GitHub issues labelled `friction` (via gh)
//
// Usage: node scripts/agents/improve.mjs [--days 30] [--min 3] [--no-github]
//          [--json]
// The brief quotes private session evidence: read it locally, and paraphrase
// (never paste) evidence into commits, PRs or issues — the repo is public.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStore, STORE } from "./score-sessions.mjs";

const DAY_MS = 86_400_000;
const EXAMPLES = 3;
const SKILL_EVALS = join(
  homedir(),
  ".cache",
  "grenmet-skill-evals",
  "results.jsonl"
);

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

// Only the latest result of each eval case counts. Every run appends to the
// results file, so without this a fixed miss, or a run where the harness
// detected nothing at all, keeps inflating the count for the whole window.
export function latestEvals(rows) {
  const latest = new Map();
  for (const r of rows) {
    const id = [r.agent, r.model, r.skill, r.prompt].join("\u0000");
    const seen = latest.get(id);
    if (!seen || (r.date ?? "") >= (seen.date ?? "")) latest.set(id, r);
  }
  return [...latest.values()];
}

// One outcome per skill an eval result checks. A "json" case lists skills
// that should and should not fire, so each of them is checked, and fails, on
// its own instead of the whole case landing in one "(json cases)" bucket.
export function evalOutcomes(r) {
  const miss = `did not trigger on: ${r.prompt}`;
  const wrong = `triggered wrongly on: ${r.prompt}`;
  if (r.expect === "trigger")
    return [{ evidence: miss, failed: r.passed === false, key: r.skill }];
  if (r.expect !== "json")
    return [{ evidence: wrong, failed: r.passed === false, key: r.skill }];
  const fired = r.fired ?? [];
  const outcomes = [
    ...(r.should_use ?? []).map((key) => ({
      evidence: miss,
      failed: !fired.includes(key),
      key,
    })),
    ...(r.should_not_use ?? []).map((key) => ({
      evidence: wrong,
      failed: fired.includes(key),
      key,
    })),
  ];
  return outcomes.length > 0
    ? outcomes
    : [
        {
          evidence: `failed on: ${r.prompt}`,
          failed: r.passed === false,
          key: r.skill,
        },
      ];
}

// Skill-trigger problems, one per skill with at least one current failure.
function skillTriggerProblems(skillEvals) {
  const bySkill = new Map();
  for (const r of latestEvals(skillEvals))
    for (const { evidence, failed, key } of evalOutcomes(r)) {
      const entry = bySkill.get(key) ?? { checked: 0, fails: [] };
      entry.checked += 1;
      if (failed) entry.fails.push(evidence);
      bySkill.set(key, entry);
    }
  return [...bySkill]
    .filter(([, { fails }]) => fails.length > 0)
    .map(([skill, { checked, fails }]) => ({
      checked,
      count: fails.length,
      examples: fails.slice(-EXAMPLES).map((evidence) => ({
        evidence,
        suggestion: "tighten the skill description's trigger phrases",
      })),
      key: skill,
      source: "skill-trigger",
    }));
}

// Each problem: a source, a key, how often it happened, how often it was
// checked, and up to EXAMPLES pieces of evidence with suggested fixes.
export function collectProblems({
  friction = [],
  scores = [],
  skillEvals = [],
}) {
  const problems = [];
  const byScorer = new Map();
  for (const r of scores) {
    const entry = byScorer.get(r.scorer) ?? { checked: 0, fails: [] };
    if (r.verdict !== "n/a") entry.checked += 1;
    if (r.verdict === "fail") entry.fails.push(r);
    byScorer.set(r.scorer, entry);
  }
  for (const [scorer, { checked, fails }] of byScorer)
    if (fails.length > 0)
      problems.push({
        checked,
        count: fails.length,
        examples: fails.slice(-EXAMPLES).map((f) => ({
          evidence: f.evidence,
          session: f.session,
          suggestion: f.suggestion,
        })),
        key: scorer,
        source: "scorer",
      });
  problems.push(...skillTriggerProblems(skillEvals));
  const byArea = new Map();
  for (const issue of friction) {
    const area =
      issue.labels.map((l) => l.name ?? l).find((n) => n.startsWith("area:")) ??
      "area:none";
    byArea.set(area, [...(byArea.get(area) ?? []), issue]);
  }
  for (const [area, issues] of byArea)
    problems.push({
      checked: issues.length,
      count: issues.length,
      examples: issues
        .slice(0, EXAMPLES)
        .map((i) => ({ evidence: `#${i.number} ${i.title}`, suggestion: "" })),
      key: area,
      source: "friction",
    });
  return problems.sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key)
  );
}

export function formatBrief(problems, { days, min }) {
  const repeated = problems.filter((p) => p.count >= min);
  const lines = [
    `# Factory improvement brief (last ${days} days, repeated ≥ ${min}×)`,
    "",
    "Evidence below quotes private sessions. Paraphrase it; never paste it into the repo.",
    "",
  ];
  if (repeated.length === 0) {
    lines.push(`No problem repeated ${min} or more times. Nothing to propose.`);
    return lines.join("\n");
  }
  lines.push(
    "| Source | Problem | Times | Checked |",
    "| --- | --- | --- | --- |"
  );
  for (const p of repeated)
    lines.push(`| ${p.source} | ${p.key} | ${p.count} | ${p.checked} |`);
  for (const p of repeated) {
    lines.push("", `## ${p.source}: ${p.key} (${p.count}×)`);
    for (const e of p.examples) {
      lines.push(
        `- ${e.evidence}${e.session ? ` (session ${e.session.slice(0, 8)})` : ""}`
      );
      if (e.suggestion) lines.push(`  - suggested: ${e.suggestion}`);
    }
  }
  return lines.join("\n");
}

function frictionIssues() {
  const result = spawnSync(
    "gh",
    [
      "issue",
      "list",
      "--label",
      "friction",
      "--state",
      "open",
      "--limit",
      "200",
      "--json",
      "number,title,labels",
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    console.error(
      `gh failed, friction issues skipped: ${result.stderr.trim()}`
    );
    return [];
  }
  return JSON.parse(result.stdout);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name, fallback) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const days = Number(option("--days", 30));
  const min = Number(option("--min", 3));
  const since = Date.now() - days * DAY_MS;
  const recent = (r) => Date.parse(r.session_end ?? r.date) >= since;
  const problems = collectProblems({
    friction: args.includes("--no-github") ? [] : frictionIssues(),
    scores: readStore(option("--store", STORE)).filter(recent),
    skillEvals: readJsonl(SKILL_EVALS).filter(recent),
  });
  console.log(
    args.includes("--json")
      ? JSON.stringify(problems, null, 2)
      : formatBrief(problems, { days, min })
  );
}
