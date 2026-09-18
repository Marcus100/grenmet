#!/usr/bin/env node
// Mechanically enforces the Never tier in CLAUDE.md/AGENTS.md and the repo's
// Git Safety Protocol. Shared between Claude Code (.claude/settings.json) and
// Codex (.codex/config.toml) — do not fork this file per tool.
//
// Plain Node, not bash+jq: this devcontainer has no jq (a missing jq used to
// make a jq-based version of this script fail OPEN, not closed — silently
// allowing everything), and nested bash/JS quote-escaping for the
// quote-stripping regex below was error-prone enough to get wrong silently.
// Node is guaranteed present (it's the whole monorepo's toolchain).

const DANGEROUS_PATTERNS = [
  /git\s+commit/,
  /git\s+push/,
  /git\s+reset\s+--hard/,
  /git\s+clean\s+-fd?/,
  /git\s+branch\s+-D/,
  /git\s+checkout\s+\./,
  /git\s+restore\s+\./,
  /push\s+--force/,
  /reset\s+--hard/,
  /gh\s+pr\s+merge/,
];

const QUOTED_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;

/**
 * Blank out quoted string literals before matching, so a grep pattern, echo
 * string, or commit message that merely mentions "git commit" doesn't trip
 * the guard — only an unquoted (i.e. actually executed) occurrence does.
 * Does NOT strip $(...) / `...` command substitution, since those really do
 * execute: `echo $(git commit ...)` must still block. Best-effort, not a
 * full shell parser — matches how Claude Code's own docs describe this class
 * of Bash-argument matching (see the `if` field docs); use the permission
 * system instead of a hook for anything that must be airtight.
 */
export function stripQuotedLiterals(command) {
  return command.replace(QUOTED_LITERAL, "");
}

export function findBlockedPattern(command) {
  const searchTarget = stripQuotedLiterals(command);
  return DANGEROUS_PATTERNS.find((pattern) => pattern.test(searchTarget));
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
    const hit = findBlockedPattern(command);
    if (hit) {
      process.stderr.write(
        `BLOCKED: '${command}' matches dangerous pattern '${hit}'. The user has prevented you from doing this — see the Never tier in CLAUDE.md/AGENTS.md.\n`
      );
      process.exit(2);
    }
    process.exit(0);
  });
}
/* c8 ignore stop */
