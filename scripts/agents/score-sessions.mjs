#!/usr/bin/env node
// LLM-as-judge scoring over past agent sessions: the factory's quality signal.
// Scorers are versioned rubrics in scripts/agents/scorers/*.md (frontmatter:
// name, description, sample, min_tools). Each run samples recent sessions
// deterministically, condenses each one (sessions.mjs digest) and asks a cheap
// model, through the plan-backed CLI with a scrubbed environment, for a verdict.
// Verdicts stay on this machine: they quote private session content.
//
//   run    [--days 7] [--limit 10] [--scorer <name>] [--judge claude|codex]
//          [--model <m>] [--judge-cmd <exe>] [--dry-run]
//   report [--days 30] [--json]
//
// Results: ~/.cache/grenmet-factory/scores.jsonl (one verdict per line).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrubbedEnv } from "./benchmark.mjs";
import { isoWeek } from "./flow.mjs";
import { claudeBinary, digest, findSessions } from "./sessions.mjs";

const FRONTMATTER_PAIR_RE = /^(\w+):\s*(.*)$/;

const here = dirname(fileURLToPath(import.meta.url));
export const SCORERS_DIR = join(here, "scorers");
export const STORE = join(
  homedir(),
  ".cache",
  "grenmet-factory",
  "scores.jsonl"
);
const DAY_MS = 86_400_000;
const SETTLE_MS = 30 * 60_000;
const JUDGE_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_MODEL = "claude-haiku-5-5";
const VERDICTS = ["pass", "fail", "n/a"];
const HASH_SPACE = 0x1_00_00_00_00;
const EVIDENCE_CHARS = 500;

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseScorer(text, file = "scorer") {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const pair = FRONTMATTER_PAIR_RE.exec(line);
    if (pair) meta[pair[1]] = pair[2].trim();
  }
  const sample = Number(meta.sample ?? 1);
  if (!meta.name) throw new Error(`${file}: frontmatter needs name`);
  if (!meta.description)
    throw new Error(`${file}: frontmatter needs description`);
  if (!(sample > 0 && sample <= 1))
    throw new Error(`${file}: sample must be in (0, 1]`);
  const rubric = match[2].trim();
  return {
    description: meta.description,
    minTools: Number(meta.min_tools ?? 0),
    name: meta.name,
    rubric,
    sample,
    // A rubric edit is a new scorer version, so old verdicts never mix in.
    version: createHash("sha256").update(text).digest("hex").slice(0, 12),
  };
}

export function loadScorers(dir = SCORERS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseScorer(readFileSync(join(dir, f), "utf8"), f));
}

// Stable sampling: the same session and scorer always get the same answer, so
// reruns score the same subset and new sessions are sampled at the same rate.
export function sampled(sessionId, scorer) {
  const hash = createHash("sha256")
    .update(`${sessionId}:${scorer.name}`)
    .digest();
  return hash.readUInt32BE(0) / HASH_SPACE < scorer.sample;
}

const toolTotal = (session) =>
  Object.values(session.toolCounts).reduce((sum, n) => sum + n, 0);

// Pending (session, scorer) pairs: sampled, settled, big enough, not yet scored
// with this scorer version.
export function selectWork({
  done,
  limit = Number.POSITIVE_INFINITY,
  now = Date.now(),
  scorers,
  sessions,
}) {
  const work = [];
  for (const session of sessions) {
    if (Date.parse(session.end) > now - SETTLE_MS) continue;
    for (const scorer of scorers) {
      if (work.length >= limit) return work;
      if (toolTotal(session) < scorer.minTools) continue;
      if (!sampled(session.id, scorer)) continue;
      if (done.has(`${session.id}:${scorer.name}:${scorer.version}`)) continue;
      work.push({ scorer, session });
    }
  }
  return work;
}

export function buildJudgePrompt(scorer, sessionText) {
  return [
    "You are grading one past coding-agent session for the Grenmet monorepo against a single rubric.",
    "Judge only what the session record shows. Do not guess about anything not shown.",
    "",
    `# Rubric: ${scorer.name}`,
    scorer.description,
    "",
    scorer.rubric,
    "",
    "# Session record",
    sessionText,
    "",
    "# Answer",
    'Reply with one JSON object and nothing else: {"verdict": "pass" | "fail" | "n/a", "evidence": "<one or two sentences citing what in the record decided it>", "suggestion": "<for fail: the smallest change to an instruction, skill or check that would prevent it; else empty>"}',
  ].join("\n");
}

// Pulls the verdict JSON out of a model reply (it may wrap it in prose or a
// code fence). Throws when there is no valid verdict.
export function parseVerdict(text) {
  const candidates = String(text).match(/\{[^{}]*"verdict"[^{}]*\}/g) ?? [];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (VERDICTS.includes(value.verdict))
        return {
          evidence: String(value.evidence ?? "").slice(0, EVIDENCE_CHARS),
          suggestion: String(value.suggestion ?? "").slice(0, EVIDENCE_CHARS),
          verdict: value.verdict,
        };
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`no verdict in judge reply: ${String(text).slice(0, 200)}`);
}

export function judgeCommand({ judge, judgeCmd, model, outFile }) {
  if (judgeCmd) return { args: [], command: judgeCmd };
  if (judge === "claude")
    return {
      // No tools, no MCP servers, no settings or hooks, no saved session: the
      // judge only reads the prompt on stdin.
      args: [
        "-p",
        "--output-format",
        "json",
        "--model",
        model,
        "--no-session-persistence",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--tools",
        "",
        "--setting-sources",
        "",
      ],
      command: claudeBinary(),
    };
  if (judge === "codex")
    return {
      args: [
        "exec",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--skip-git-repo-check",
        "-o",
        outFile,
        ...(model ? ["-m", model] : []),
        "-",
      ],
      command: process.env.CODEX_BIN ?? "codex",
    };
  throw new Error("--judge must be claude or codex");
}

// The text the judge answered with, from each CLI's output format.
export function judgeReply({ judge, judgeCmd, outFile, stdout }) {
  if (judgeCmd) return stdout;
  if (judge === "codex") return readFileSync(outFile, "utf8");
  const result = JSON.parse(stdout);
  if (result.is_error) throw new Error(`judge failed: ${result.result}`);
  return result.result;
}

export function runJudge({ judge, judgeCmd, model, prompt }) {
  // An empty working directory: no project instructions, hooks or files.
  const cwd = mkdtempSync(join(tmpdir(), "grenmet-judge-"));
  const outFile = join(cwd, "reply.txt");
  try {
    const { args, command } = judgeCommand({ judge, judgeCmd, model, outFile });
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      env: scrubbedEnv(),
      input: prompt,
      maxBuffer: 16 * 1024 * 1024,
      timeout: JUDGE_TIMEOUT_MS,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `judge exited ${result.status}: ${(result.stderr || result.stdout).slice(0, 300)}`
      );
    return parseVerdict(
      judgeReply({ judge, judgeCmd, outFile, stdout: result.stdout })
    );
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
}

export function readStore(file = STORE) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function scoreRecord({
  judgeModel,
  scorer,
  session,
  verdict,
  now = new Date(),
}) {
  return {
    agent: session.agent,
    branches: Object.keys(session.branches),
    date: now.toISOString(),
    judge_model: judgeModel,
    model: session.model,
    scorer: scorer.name,
    scorer_version: scorer.version,
    session: session.id,
    session_end: session.end,
    ...verdict,
  };
}

// Pass rate per scorer, overall and per ISO week of the session.
export function summarizeScores(records) {
  const byScorer = {};
  for (const r of records) {
    byScorer[r.scorer] ??= { fail: 0, na: 0, pass: 0, weeks: {} };
    const entry = byScorer[r.scorer];
    const week = isoWeek(r.session_end ?? r.date);
    entry.weeks[week] ??= { fail: 0, pass: 0 };
    if (r.verdict === "n/a") {
      entry.na += 1;
      continue;
    }
    const key = r.verdict === "pass" ? "pass" : "fail";
    entry[key] += 1;
    entry.weeks[week][key] += 1;
  }
  return byScorer;
}

const rate = (pass, fail) =>
  pass + fail === 0 ? "n/a" : `${Math.round((100 * pass) / (pass + fail))}%`;

export function formatSummary(summary) {
  const lines = [
    "Scorer                 pass  fail  n/a  pass-rate  by week (pass-rate)",
  ];
  for (const [name, s] of Object.entries(summary).sort()) {
    const weeks = Object.entries(s.weeks)
      .sort()
      .map(([w, v]) => `${w.slice(5)} ${rate(v.pass, v.fail)}`)
      .join("  ");
    lines.push(
      `${name.padEnd(22)} ${String(s.pass).padStart(4)}  ${String(s.fail).padStart(4)}  ${String(s.na).padStart(3)}  ${rate(s.pass, s.fail).padStart(9)}  ${weeks}`
    );
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const [command = "run", ...rest] = argv;
  const options = { command, flags: new Set(), values: {} };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected ${arg}`);
    if (["--dry-run", "--json"].includes(arg)) options.flags.add(arg.slice(2));
    else {
      options.values[arg.slice(2)] = rest[i + 1];
      i += 1;
    }
  }
  return options;
}

function main() {
  const { command, flags, values } = parseArgs(process.argv.slice(2));
  const store = values.store ?? STORE;
  if (command === "report") {
    const days = Number(values.days ?? 30);
    const since = Date.now() - days * DAY_MS;
    const records = readStore(store).filter(
      (r) => Date.parse(r.session_end ?? r.date) >= since
    );
    const summary = summarizeScores(records);
    console.log(
      flags.has("json")
        ? JSON.stringify(summary, null, 2)
        : formatSummary(summary)
    );
    return;
  }
  if (command !== "run") throw new Error("command must be run or report");
  const judge = values.judge ?? "claude";
  const model =
    values.model ?? (judge === "claude" ? DEFAULT_MODEL : undefined);
  let scorers = loadScorers(values.scorers ?? SCORERS_DIR);
  if (values.scorer) scorers = scorers.filter((s) => s.name === values.scorer);
  if (scorers.length === 0) throw new Error("no scorer matched");
  const done = new Set(
    readStore(store).map((r) => `${r.session}:${r.scorer}:${r.scorer_version}`)
  );
  const work = selectWork({
    done,
    limit: Number(values.limit ?? 10),
    scorers,
    sessions: findSessions({ days: Number(values.days ?? 7) }),
  });
  console.log(
    `${work.length} verdict(s) to request (judge ${judge}${model ? `/${model}` : ""})`
  );
  let failed = 0;
  for (const { scorer, session } of work) {
    const label = `${session.end.slice(0, 10)} ${session.id.slice(0, 8)} ${scorer.name}`;
    if (flags.has("dry-run")) {
      console.log(`  would score ${label}`);
      continue;
    }
    try {
      const verdict = runJudge({
        judge,
        judgeCmd: values["judge-cmd"],
        model,
        prompt: buildJudgePrompt(scorer, digest(session)),
      });
      mkdirSync(dirname(store), { recursive: true });
      appendFileSync(
        store,
        `${JSON.stringify(scoreRecord({ judgeModel: model ?? judge, scorer, session, verdict }))}\n`
      );
      console.log(`  ${verdict.verdict.padEnd(4)} ${label}`);
    } catch (error) {
      failed += 1;
      console.error(
        `  error ${label}: ${error instanceof Error ? error.message : error}`
      );
      // The same cause (login, network, limit) will fail every call: stop early.
      if (failed >= 2) throw new Error("judge failed twice; stopping");
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
