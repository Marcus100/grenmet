#!/usr/bin/env node
// SessionStart: show the newest SESSION_LOG.md entries so a new session
// (Claude Code or Codex, any worktree) starts from the latest handoff.
//
// Newest first and size-capped. Claude Code saves SessionStart output over
// 10,000 characters to a file and shows only a 2,000-character preview of
// its *start*; Codex previews anything over ~2,500 tokens. The previous
// `tail -n 40` printed ~21 KB oldest-first, so agents saw the oldest
// entries and never the latest one.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const LOG_NAME = "SESSION_LOG.md";
// Below both clients' preview thresholds (10,000 chars; ~2,500 tokens).
export const MAX_OUTPUT_CHARS = 8000;
const ENTRY_SEPARATOR = /\n\s*\n/;

function mainCheckoutRoot(cwd) {
  const result = spawnSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd, encoding: "utf8" }
  );
  return result.status === 0 ? dirname(result.stdout.trim()) : null;
}

/** Newest entries first, whole entries only, within `budget` characters. */
export function renderHandoff(logText, logPath, budget = MAX_OUTPUT_CHARS) {
  const entries = logText
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reverse();
  const header = `Latest ${LOG_NAME} entries, newest first. Older entries: ${logPath}\n`;
  const shown = [];
  let used = header.length;
  for (const entry of entries) {
    const cost = entry.length + 2;
    if (used + cost > budget) {
      if (shown.length === 0) {
        shown.push(`${entry.slice(0, budget - used - 3)}…`);
      }
      break;
    }
    shown.push(entry);
    used += cost;
  }
  return `${header}\n${shown.join("\n\n")}\n`;
}

/* c8 ignore start -- exercised via scripts/guardrails/agent-hook-behavior.test.mjs, not by running this file directly */
if (import.meta.url === `file://${process.argv[1]}`) {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const root = mainCheckoutRoot(cwd);
  const logPath = root ? join(root, LOG_NAME) : "";
  if (logPath && existsSync(logPath)) {
    process.stdout.write(renderHandoff(readFileSync(logPath, "utf8"), logPath));
  }
  process.exit(0);
}
/* c8 ignore stop */
