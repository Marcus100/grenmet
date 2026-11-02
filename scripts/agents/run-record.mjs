#!/usr/bin/env node
// Structured records that make agent runs measurable. A record is one GitHub
// comment: a marker line, a one-line summary and a fenced JSON block, so humans
// read it and scripts/agents/run-report.mjs parses it. Three kinds:
//   run     - an agent finished a task (outcome, retries, checks, time, tier)
//   review  - a human reviewed an agent PR (minutes spent, accepted or not)
//   usage   - weekly plan-limit consumption (a percentage you read off the plan)
//
// Usage: node scripts/agents/run-record.mjs --kind run --agent claude --model <m>
//          --task <id> --outcome success --verify pass --retries 0
//          --wall-minutes 12 --tier low [--pr 12] [--benchmark bm-01]
//          [--friction "<text>"] [--post <issue-or-pr number>]
//          [--from-session latest|<session id>]
// --from-session fills agent, model, wall minutes and token counts from the
// local transcript (scripts/agents/sessions.mjs); flags given explicitly win.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findSessions, latestSession } from "./sessions.mjs";

export const MARKER = "<!-- agent-run:v1 -->";
const AGENTS = ["claude", "codex"];
const OUTCOMES = ["success", "flawed", "blocked", "manual"];
const VERIFY = ["pass", "fail", "skipped"];
const TIERS = ["low", "standard", "high"];
const WEEK = /^\d{4}-W\d{2}$/u;
const MAX_PERCENT = 100;
const RECORD_BLOCK = /```json\n([\s\S]*?)\n```/u;

const isNonNegative = (value) => Number.isFinite(value) && value >= 0;
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isText = (value) => typeof value === "string" && value.trim() !== "";
const oneOf = (list) => (value) => list.includes(value);

// field -> [validator, description]; `?` fields are optional.
const FIELDS = {
  review: {
    accepted: [(v) => typeof v === "boolean", "a boolean"],
    pr: [isCount, "a non-negative integer"],
    review_minutes: [isNonNegative, "a non-negative number"],
  },
  run: {
    agent: [oneOf(AGENTS), `one of ${AGENTS.join(", ")}`],
    friction: [isText, 'a non-empty string (use "none")'],
    model: [isText, "a non-empty string"],
    outcome: [oneOf(OUTCOMES), `one of ${OUTCOMES.join(", ")}`],
    retries: [isCount, "a non-negative integer"],
    task: [isText, "a non-empty string"],
    tier: [oneOf(TIERS), `one of ${TIERS.join(", ")}`],
    verify: [oneOf(VERIFY), `one of ${VERIFY.join(", ")}`],
    wall_minutes: [isNonNegative, "a non-negative number"],
  },
  usage: {
    agent: [oneOf(AGENTS), `one of ${AGENTS.join(", ")}`],
    percent: [
      (v) => isNonNegative(v) && v <= MAX_PERCENT,
      `a number from 0 to ${MAX_PERCENT}`,
    ],
    week: [(v) => typeof v === "string" && WEEK.test(v), "like 2026-W42"],
  },
};
const OPTIONAL = {
  review: [],
  run: [
    "pr",
    "benchmark",
    "session",
    "input_tokens",
    "output_tokens",
    "total_tokens",
  ],
  usage: [],
};

// Returns a list of problems; an empty list means the record is valid.
export function validateRecord(record) {
  if (record === null || typeof record !== "object")
    return ["record must be an object"];
  const spec = FIELDS[record.kind];
  if (!spec) return [`kind must be one of ${Object.keys(FIELDS).join(", ")}`];
  const problems = [];
  for (const [field, [valid, description]] of Object.entries(spec))
    if (!valid(record[field])) problems.push(`${field} must be ${description}`);
  const known = new Set([
    "kind",
    ...Object.keys(spec),
    ...OPTIONAL[record.kind],
  ]);
  for (const field of Object.keys(record))
    if (!known.has(field)) problems.push(`unknown field ${field}`);
  if (record.kind === "run") {
    if (record.pr !== undefined && !isCount(record.pr))
      problems.push("pr must be a non-negative integer");
    if (record.benchmark !== undefined && !isText(record.benchmark))
      problems.push("benchmark must be a non-empty string");
    if (record.session !== undefined && !isText(record.session))
      problems.push("session must be a non-empty string");
    for (const field of ["input_tokens", "output_tokens", "total_tokens"])
      if (record[field] !== undefined && !isCount(record[field]))
        problems.push(`${field} must be a non-negative integer`);
  }
  return problems;
}

function summary(record) {
  if (record.kind === "run")
    return `**Agent run:** ${record.agent} · ${record.model} · ${record.outcome} · ${record.task}`;
  if (record.kind === "review")
    return `**Review:** PR #${record.pr} · ${record.accepted ? "accepted" : "not accepted"} · ${record.review_minutes} min`;
  return `**Plan usage:** ${record.agent} · ${record.week} · ${record.percent}%`;
}

export function formatRecord(record) {
  const problems = validateRecord(record);
  if (problems.length > 0)
    throw new Error(`Invalid run record: ${problems.join("; ")}`);
  return `${MARKER}\n${summary(record)}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

// Extracts every valid record from a body of text (one or many comments).
// Invalid or malformed blocks are reported, never silently dropped.
export function parseRecords(text) {
  const records = [];
  const errors = [];
  for (const chunk of text.split(MARKER).slice(1)) {
    const block = RECORD_BLOCK.exec(chunk);
    if (!block) {
      errors.push("marker without a json block");
      continue;
    }
    try {
      const record = JSON.parse(block[1]);
      const problems = validateRecord(record);
      if (problems.length === 0) records.push(record);
      else errors.push(problems.join("; "));
    } catch {
      errors.push("json block does not parse");
    }
  }
  return { errors, records };
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) throw new Error(`Unexpected ${argv[i]}`);
    values[argv[i].slice(2)] = argv[i + 1];
  }
  const number = (name) =>
    values[name] === undefined ? undefined : Number(values[name]);
  const record = { kind: values.kind ?? "run" };
  const put = (field, value) => {
    if (value !== undefined && !Number.isNaN(value)) record[field] = value;
  };
  put("agent", values.agent);
  put("model", values.model);
  put("task", values.task);
  put("outcome", values.outcome);
  put("verify", values.verify);
  put("tier", values.tier);
  put(
    "friction",
    values.friction ?? (record.kind === "run" ? "none" : undefined)
  );
  put("retries", number("retries"));
  put("wall_minutes", number("wall-minutes"));
  put("pr", number("pr"));
  put("benchmark", values.benchmark);
  put("review_minutes", number("review-minutes"));
  put("week", values.week);
  put("percent", number("percent"));
  if (values.accepted !== undefined)
    record.accepted = values.accepted === "true";
  return { fromSession: values["from-session"], post: values.post, record };
}

// Fills what the transcript knows; anything already on the record wins.
export function withSession(record, session) {
  if (!session) throw new Error("no matching local session transcript found");
  return {
    agent: session.agent,
    input_tokens: session.tokens.input + session.tokens.cached,
    model: session.model,
    output_tokens: session.tokens.output,
    session: session.id,
    total_tokens: session.tokens.total,
    wall_minutes: session.minutes,
    ...record,
  };
}

function resolveSession(ref) {
  if (ref === "latest") return latestSession();
  return findSessions({ days: 30 }).find((s) => s.id === ref);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const {
      fromSession,
      post,
      record: given,
    } = parseArgs(process.argv.slice(2));
    const record =
      fromSession === undefined
        ? given
        : withSession(given, resolveSession(fromSession));
    const body = formatRecord(record);
    if (post === undefined) process.stdout.write(body);
    else {
      const result = spawnSync(
        "gh",
        ["issue", "comment", post, "--body-file", "-"],
        {
          encoding: "utf8",
          input: body,
        }
      );
      if (result.status !== 0) throw new Error(`gh failed: ${result.stderr}`);
      console.log(`posted run record to #${post}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
