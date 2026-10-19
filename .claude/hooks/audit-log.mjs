#!/usr/bin/env node
// Defense-in-depth, not a gate: appends every Bash command to a local,
// gitignored log. block-dangerous-git.mjs is regex-based best-effort (see
// its own comments) — a genuinely determined attempt to route around it
// (an alias, a wrapper script, unusual quoting) isn't guaranteed to be
// caught. This doesn't stop that; it means there's a record afterward, for
// both tools and every worktree, in one place: the main checkout.
//
// The log must not become a secret store, so credential-shaped values are
// redacted before writing, and the file rotates instead of growing forever.

import { appendFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { mainCheckoutRoot } from "./main-checkout.mjs";

const LOG_NAME = ".agents-bash-audit.log";
// About 30,000 typical commands. One rotated copy (.1) caps disk use at
// 10 MB; the unbounded version grew to 13 MB.
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const REDACTED = "[REDACTED]";

const SECRET_PATTERNS = [
  // key=value and key: value for credential-like names
  /\b([\w-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)[\w-]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s'"&;|]+)/gi,
  // Authorization headers
  /\b(Bearer|Basic|token)(\s+)([A-Za-z0-9._~+/=-]{12,})/g,
  // user:password@host in URLs
  /(:\/\/[^\s:/@]+)(:)([^\s@/]+)(?=@)/g,
  // Well-known token shapes (GitHub, Slack, AWS, OpenAI/Anthropic-style)
  /()()(\b(?:gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}))/g,
  // -p<pass> / --password <pass> on database and transfer clients
  /\b((?:mysql|psql|ftp|sftp|lftp|sshpass)\b[^\n;|&]*?\s(?:-p|--password[= ]?))(\s*)([^\s'"]+)/g,
];

export function redactSecrets(command) {
  return SECRET_PATTERNS.reduce(
    (text, pattern) =>
      text.replace(pattern, (_match, prefix, separator) =>
        `${prefix}${separator}${REDACTED}`
      ),
    command
  );
}

export function appendAuditLine(logPath, command, now = new Date()) {
  try {
    if (statSync(logPath).size > MAX_LOG_BYTES) {
      renameSync(logPath, `${logPath}.1`);
    }
  } catch {
    // No log yet.
  }
  const line = `${now.toISOString()}\t${redactSecrets(command).replaceAll("\n", "\\n")}\n`;
  appendFileSync(logPath, line);
}

/* c8 ignore start -- exercised via scripts/guardrails/agent-hook-behavior.test.mjs, not by running this file directly */
if (import.meta.url === `file://${process.argv[1]}`) {
  let data = "";
  process.stdin.on("data", (chunk) => {
    data += chunk;
  });
  process.stdin.on("end", () => {
    let command = "";
    try {
      command = JSON.parse(data)?.tool_input?.command ?? "";
    } catch {
      process.exit(0);
    }
    if (command) {
      try {
        appendAuditLine(join(mainCheckoutRoot(), LOG_NAME), command);
      } catch {
        // Never block or error the turn over a logging failure.
      }
    }
    process.exit(0);
  });
}
/* c8 ignore stop */
