#!/usr/bin/env node
// Flow metrics for the factory, the numbers Warp calls cost per PR and human
// interactions per PR, adapted to how this repo ships: most work lands as a
// branch merged into local `dev` (not a GitHub PR), so the unit is a change, one
// non-sync merge or direct commit on `origin/dev`'s first-parent history.
//
//   changes merged, reverts and revert rate        from git
//   lead time (first branch commit → merged)       from git
//   agent tokens, human prompts and active hours   from local transcripts
//   per change: tokens, prompts, agent hours       window totals ÷ changes
//
// Usage: node scripts/agents/flow.mjs [--days 14] [--ref origin/dev] [--json]
// Tokens are the cost unit: runs use plan allowances, not per-token billing.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findSessions } from "./sessions.mjs";

const MERGE_PULL_REQUEST_RE = /^Merge pull request #\d+ from [^/\s]+\/(\S+)/;
const MERGE_REMOTE_TRACKING_RE =
  /^Merge remote-tracking branch '(?:[^/']+\/)?([^']+)'/;
const MERGE_BRANCH_RE = /^Merge branch '([^']+)'/;
const MERGE_SHORT_RE = /^Merge ([\w./-]+?)(?::|\s+into\s|$)/;
const PR_NUMBER_RE = /^Merge pull request #(\d+)/;
const REVERT_RE = /^Revert\b/;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WEEK_DAYS = 7;
const DEFAULT_DAYS = 14;
const SEP = "\u001f";
const SYNC_BRANCHES = new Set(["dev", "origin/dev", "staging", "main"]);

// The branch a merge commit brought in, or undefined when it cannot tell.
export function branchFromSubject(subject) {
  const patterns = [
    MERGE_PULL_REQUEST_RE,
    MERGE_REMOTE_TRACKING_RE,
    MERGE_BRANCH_RE,
    MERGE_SHORT_RE,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(subject);
    if (match) return match[1];
  }
}

export const prFromSubject = (subject) => {
  const match = PR_NUMBER_RE.exec(subject);
  return match ? Number(match[1]) : undefined;
};

export const isRevert = (subject) => REVERT_RE.test(subject);

// `log` is `git log --first-parent --format=%H␟%cI␟%P␟%s`; `branchStart` maps a
// merge sha to the earliest author date of the commits it brought in.
export function parseChanges(log, branchStart = () => undefined) {
  const changes = [];
  for (const line of log.split("\n")) {
    if (line.trim() === "") continue;
    const [sha, committed, parents, subject] = line.split(SEP);
    const isMerge = parents.trim().split(" ").length > 1;
    const branch = isMerge ? branchFromSubject(subject) : undefined;
    if (isMerge && (branch === undefined || SYNC_BRANCHES.has(branch)))
      continue;
    const started = isMerge ? branchStart(sha) : undefined;
    changes.push({
      branch,
      committed,
      leadHours:
        started === undefined
          ? 0
          : Math.max(
              0,
              (Date.parse(committed) - Date.parse(started)) / HOUR_MS
            ),
      pr: prFromSubject(subject),
      revert: isRevert(subject),
      sha,
      subject,
    });
  }
  return changes;
}

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const ratio = (part, whole) => (whole === 0 ? null : part / whole);
const sum = (values) => values.reduce((total, v) => total + v, 0);

// ISO week label like 2026-W43 for a timestamp.
export function isoWeek(timestamp) {
  const source = new Date(timestamp);
  const date = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate())
  );
  const day = date.getUTCDay() || WEEK_DAYS;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / DAY_MS + 1) / WEEK_DAYS);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function totals(sessions) {
  return {
    activeHours: sum(sessions.map((s) => s.minutes)) / 60,
    prompts: sum(sessions.map((s) => s.prompts.length)),
    sessions: sessions.length,
    tokens: sum(sessions.map((s) => s.tokens.total)),
  };
}

function perChange(window, changes) {
  return {
    activeHours: ratio(window.activeHours, changes),
    prompts: ratio(window.prompts, changes),
    tokens: ratio(window.tokens, changes),
  };
}

// Tokens and prompts a session spent on one branch, split by its token share.
function attributed(sessions, branch) {
  let tokens = 0;
  let prompts = 0;
  for (const s of sessions) {
    const onBranch = s.branches[branch];
    if (!onBranch) continue;
    tokens += onBranch;
    prompts += s.prompts.length * (onBranch / (s.tokens.total || 1));
  }
  return { prompts, tokens };
}

export function computeFlow({ changes, sessions }) {
  const shipped = changes.filter((c) => !c.revert);
  const reverts = changes.filter((c) => c.revert);
  const leads = shipped.filter((c) => c.branch).map((c) => c.leadHours);
  const window = totals(sessions);
  const byModel = {};
  for (const s of sessions) {
    const key = `${s.agent}/${s.model ?? "unknown"}`;
    byModel[key] = (byModel[key] ?? 0) + s.tokens.total;
  }
  const weeks = [
    ...new Set([
      ...changes.map((c) => isoWeek(c.committed)),
      ...sessions.map((s) => isoWeek(s.end)),
    ]),
  ].sort();
  const byWeek = weeks.map((week) => {
    const weekChanges = shipped.filter((c) => isoWeek(c.committed) === week);
    const weekSessions = sessions.filter((s) => isoWeek(s.end) === week);
    const weekTotals = totals(weekSessions);
    return {
      changes: weekChanges.length,
      reverts: reverts.filter((c) => isoWeek(c.committed) === week).length,
      week,
      ...weekTotals,
      perChange: perChange(weekTotals, weekChanges.length),
    };
  });
  return {
    byModel,
    byWeek,
    changes: shipped.map((c) => ({
      ...c,
      ...(c.branch
        ? attributed(sessions, c.branch)
        : { prompts: 0, tokens: 0 }),
    })),
    leadHours: { median: median(leads), p90: percentile(leads, 0.9) },
    merged: shipped.length,
    perChange: perChange(window, shipped.length),
    prs: shipped.filter((c) => c.pr !== undefined).length,
    revertRate: ratio(reverts.length, shipped.length),
    reverts: reverts.length,
    window,
  };
}

const tok = (n) => {
  if (n === null || n === undefined) return "n/a";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
};
const one = (n) => (n === null ? "n/a" : n.toFixed(1));
const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

export function formatFlow(flow, { days, ref }) {
  const { leadHours, perChange: per, window } = flow;
  const lines = [
    `Last ${days} days on ${ref}: ${flow.merged} changes merged (${flow.prs} via PR), ${flow.reverts} reverts (${pct(flow.revertRate)})`,
    `Lead time, first commit → merged: median ${one(leadHours.median)} h, p90 ${one(leadHours.p90)} h`,
    `Agent sessions: ${window.sessions}, ${tok(window.tokens)} tokens, ${window.prompts} human prompts, ${one(window.activeHours)} active hours`,
    `Per merged change: ${tok(per.tokens)} tokens, ${one(per.prompts)} human prompts, ${one(per.activeHours)} agent hours`,
    "",
    "Tokens by agent/model:",
    ...Object.entries(flow.byModel)
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => `  ${key.padEnd(30)} ${tok(n).padStart(8)}`),
    "",
    "Week       changes  reverts  sessions  tokens/change  prompts/change",
    ...flow.byWeek.map(
      (w) =>
        `${w.week}  ${String(w.changes).padStart(7)}  ${String(w.reverts).padStart(7)}  ${String(w.sessions).padStart(8)}  ${tok(w.perChange.tokens).padStart(13)}  ${one(w.perChange.prompts).padStart(14)}`
    ),
    "",
    "Changes (tokens and prompts attributed by branch; 0 = no session on that branch):",
    ...flow.changes.map(
      (c) =>
        `  ${c.committed.slice(0, 10)}  ${(c.branch ?? "(direct commit)").slice(0, 44).padEnd(44)} lead ${one(c.leadHours).padStart(6)} h  ${tok(c.tokens).padStart(7)}  ${one(c.prompts).padStart(5)} hp`
    ),
  ];
  return lines.join("\n");
}

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}

function branchStart(sha) {
  const out = git(["log", "--format=%aI", `${sha}^1..${sha}^2`]).trim();
  if (out === "") return;
  return out.split("\n").sort()[0];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const option = (name, fallback) =>
      args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
    const days = Number(option("--days", DEFAULT_DAYS));
    const ref = option("--ref", "origin/dev");
    const since = new Date(Date.now() - days * DAY_MS).toISOString();
    const log = git([
      "log",
      "--first-parent",
      `--since=${since}`,
      `--format=%H${SEP}%cI${SEP}%P${SEP}%s`,
      ref,
    ]);
    const flow = computeFlow({
      changes: parseChanges(log, branchStart),
      sessions: findSessions({ days }),
    });
    console.log(
      args.includes("--json")
        ? JSON.stringify(flow, null, 2)
        : formatFlow(flow, { days, ref })
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
