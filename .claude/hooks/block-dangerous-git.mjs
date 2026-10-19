#!/usr/bin/env node
// Mechanically enforces the Never tier in AGENTS.md and the repo's
// Git Safety Protocol. Shared between Claude Code (.claude/settings.json) and
// Codex (.codex/config.toml) — do not fork this file per tool.
//
// Plain Node, not bash+jq: this devcontainer has no jq (a missing jq used to
// make a jq-based version of this script fail OPEN, not closed — silently
// allowing everything), and nested bash/JS quote-escaping for the
// quote-stripping regex below was error-prone enough to get wrong silently.
// Node is guaranteed present (it's the whole monorepo's toolchain).
//
// Best-effort, not a shell parser. The hard layer is `permissions.deny` in
// .claude/settings.json, which Claude Code enforces even when a hook allows.

import { spawnSync } from "node:child_process";

// `[^;&|]*` keeps a match inside one subcommand, so `git push && rm -f x`
// does not read as a forced push.
const SAME_COMMAND = "[^;&|\\n]*";
// `.` and `:/` both name the whole working tree as a pathspec.
const WHOLE_TREE = "(?:\\.|:/)(?:\\s|$)";
const DANGEROUS_PATTERNS = [
  /reset\s+--hard/,
  new RegExp(
    `\\bgit\\b${SAME_COMMAND}\\bclean\\b${SAME_COMMAND}\\s(?:-[a-zA-Z]*f|--force)`
  ),
  new RegExp(
    `\\bgit\\b${SAME_COMMAND}\\bbranch\\b${SAME_COMMAND}\\s-[a-zA-Z]*D`
  ),
  new RegExp(
    `\\bgit\\b${SAME_COMMAND}\\bbranch\\b(?=${SAME_COMMAND}\\s(?:--delete|-d)\\b)(?=${SAME_COMMAND}\\s(?:--force|-f)\\b)`
  ),
  // `git checkout .`, `git checkout HEAD -- .` and `git checkout -- :/`
  // overwrite every uncommitted edit.
  new RegExp(`\\bgit\\b${SAME_COMMAND}\\bcheckout\\s+(?:--\\s+)?${WHOLE_TREE}`),
  new RegExp(
    `\\bgit\\b${SAME_COMMAND}\\bcheckout\\b${SAME_COMMAND}\\s--\\s+${WHOLE_TREE}`
  ),
  new RegExp(
    `\\bgit\\b${SAME_COMMAND}\\bcheckout\\b${SAME_COMMAND}\\s(?:-f|--force)\\b`
  ),
  new RegExp(
    `\\bgit\\b${SAME_COMMAND}\\bswitch\\b${SAME_COMMAND}\\s(?:-f|--force|--discard-changes)\\b`
  ),
  new RegExp(`\\bgit\\b${SAME_COMMAND}\\bstash\\s+clear\\b`),
  new RegExp(
    `\\bgit\\b${SAME_COMMAND}\\bworktree\\s+remove\\b${SAME_COMMAND}\\s(?:-f|--force)\\b`
  ),
  /push\s+--force/,
  new RegExp(`\\bgit\\b${SAME_COMMAND}\\bpush\\b${SAME_COMMAND}\\s-[a-zA-Z]*f\\b`),
  new RegExp(`\\bgit\\b${SAME_COMMAND}\\bpush\\b${SAME_COMMAND}\\s\\+[\\w./-]+`),
  // Merging through the REST API skips the staging-only rule below.
  new RegExp(`\\bgh\\s+api\\b${SAME_COMMAND}/pulls/\\d+/merge\\b`),
];

// `git restore .` discards working-tree edits; `git restore --staged .` only
// unstages, which loses nothing.
const RESTORE_ALL = new RegExp(
  `\\bgit\\b${SAME_COMMAND}\\brestore\\b(${SAME_COMMAND})\\s${WHOLE_TREE}`
);
const STAGED_ONLY = /--staged|\s-S\b/;
const WORKTREE_FLAG = /--worktree|\s-W\b/;

const QUOTED_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
// `bash -c "…"`, `sh -c '…'` and `eval "…"` execute their quoted argument, so
// it is scanned as a command instead of being stripped as a literal.
const SHELL_WRAPPER =
  /\b(?:(?:ba|z|da)?sh\s+(?:-[a-zA-Z]+\s+)*-c|eval)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
const MAX_WRAPPER_DEPTH = 3;
// <<EOF, <<-EOF, <<'EOF' and <<"EOF": opener line, body, closing delimiter.
const HEREDOC =
  /([^\n]*<<-?\s*(['"]?)(\w+)\2[^\n]*)\n([\s\S]*?)\n(\s*\3)(?=\n|$)/g;
const SUBCOMMAND_BREAK = /[;&|]/;
const SHELL_CONSUMER =
  /^\s*(?:\w+=\S*\s+)*(?:sudo\s+)?(?:(?:ba|z|da)?sh|eval|source)\b/;
const PIPED_TO_SHELL = /\|\s*(?:sudo\s+)?(?:(?:ba|z|da)?sh|eval|source)\b/;
const COMMAND_SUBSTITUTION = /\$\([^)]*\)|`[^`]*`/g;

const GH_PR_MERGE = new RegExp(`\\bgh\\s+pr\\s+merge\\b(${SAME_COMMAND})`, "g");
const ALLOWED_MERGE_BASE = "staging";
// Merge flags that take a separate value, so the value is not the PR.
const MERGE_FLAGS_WITH_VALUE = new Set([
  "-A",
  "--author-email",
  "-b",
  "--body",
  "-F",
  "--body-file",
  "--match-head-commit",
  "-R",
  "--repo",
  "-t",
  "--subject",
]);
// gh pr view usually answers in under 2 s; 15 s covers a slow network
// without stalling the agent's turn for long.
const GH_LOOKUP_TIMEOUT_MS = 15_000;

/**
 * Blank out quoted string literals before matching, so a grep pattern, echo
 * string, or commit message that merely mentions "git commit" doesn't trip
 * the guard — only an unquoted (i.e. actually executed) occurrence does.
 * Does NOT strip $(...) / `...` command substitution, since those really do
 * execute: `echo $(git reset --hard)` must still block.
 */
export function stripQuotedLiterals(command) {
  return command.replace(QUOTED_LITERAL, "");
}

function unquote(literal) {
  const body = literal.slice(1, -1);
  return literal.startsWith('"') ? body.replace(/\\(.)/g, "$1") : body;
}

/**
 * Split heredoc bodies out of a command. A body fed to a shell runs, so it is
 * returned for scanning; any other body (a commit message, a file written
 * with `cat >`) is text, except that an unquoted delimiter still expands
 * `$(…)` and backticks.
 */
function separateHeredocs(command) {
  const executed = [];
  const outer = command.replace(
    HEREDOC,
    (_match, opener, quote, _delimiter, body, closer) => {
      // The command that reads the heredoc is the one written before `<<`;
      // anything after it on the line (`&& echo`, `; …`) runs separately,
      // except a pipe into a shell.
      const redirect = opener.indexOf("<<");
      const reader = opener.slice(0, redirect).split(SUBCOMMAND_BREAK).at(-1);
      const rest = opener.slice(redirect);
      if (SHELL_CONSUMER.test(reader ?? "") || PIPED_TO_SHELL.test(rest)) {
        executed.push(body);
      } else if (!quote) {
        executed.push(...(body.match(COMMAND_SUBSTITUTION) ?? []));
      }
      return `${opener}\n${closer}`;
    }
  );
  return { outer, executed };
}

/** The command plus every command nested in a shell wrapper, quotes stripped. */
function executedSegments(command, depth = 0) {
  const { outer, executed } = separateHeredocs(command);
  const segments = [stripQuotedLiterals(outer)];
  if (depth >= MAX_WRAPPER_DEPTH) return segments;
  for (const body of executed) {
    segments.push(...executedSegments(body, depth + 1));
  }
  for (const match of outer.matchAll(SHELL_WRAPPER)) {
    segments.push(...executedSegments(unquote(match[1]), depth + 1));
  }
  return segments;
}

/** The PR (number, URL or branch) and repo named by merge arguments. */
export function parseMergeTarget(args) {
  let prRef;
  let repo;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (MERGE_FLAGS_WITH_VALUE.has(arg)) {
      if (arg === "-R" || arg === "--repo") repo = args[index + 1] ?? "";
      index++;
    } else if (arg.startsWith("--repo=")) {
      repo = arg.slice("--repo=".length);
    } else if (!(arg.startsWith("-") || prRef)) {
      prRef = arg;
    }
  }
  return { prRef, repo };
}

/** Ask GitHub which branch a PR merges into; null when it can't tell. */
export function lookupMergeBase(args) {
  const { prRef, repo } = parseMergeTarget(args);
  const repoArgs = repo === undefined ? [] : ["--repo", repo];
  const result = spawnSync(
    "gh",
    [
      "pr",
      "view",
      ...(prRef ? [prRef] : []),
      ...repoArgs,
      "--json",
      "baseRefName",
      "--jq",
      ".baseRefName",
    ],
    { encoding: "utf8", timeout: GH_LOOKUP_TIMEOUT_MS }
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * `gh pr merge` is allowed only into staging (AGENTS.md standing
 * authorization) and never with `--admin`, which bypasses branch protection.
 * Fails closed: an unknown base blocks.
 */
function findBlockedMerge(segment, lookupBase) {
  for (const match of segment.matchAll(GH_PR_MERGE)) {
    const args = match[1].trim().split(/\s+/).filter(Boolean);
    if (args.includes("--admin")) {
      return "gh pr merge --admin (bypasses branch protection)";
    }
    const base = lookupBase(args);
    if (base !== ALLOWED_MERGE_BASE) {
      return `gh pr merge into '${base ?? "unknown base"}' (only ${ALLOWED_MERGE_BASE} merges are authorized)`;
    }
  }
  return undefined;
}

function findDiscardingRestore(segment) {
  const match = RESTORE_ALL.exec(segment);
  if (!match) return undefined;
  const flags = ` ${match[1]}`;
  const unstageOnly = STAGED_ONLY.test(flags) && !WORKTREE_FLAG.test(flags);
  return unstageOnly ? undefined : RESTORE_ALL;
}

export function findBlockedPattern(
  command,
  { lookupBase = lookupMergeBase } = {}
) {
  for (const segment of executedSegments(command)) {
    const hit =
      DANGEROUS_PATTERNS.find((pattern) => pattern.test(segment)) ??
      findDiscardingRestore(segment) ??
      findBlockedMerge(segment, lookupBase);
    if (hit) return hit;
  }
  return undefined;
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
        `BLOCKED: '${command}' matches dangerous pattern '${hit}'. The user has prevented you from doing this — see the Never tier in AGENTS.md.\n`
      );
      process.exit(2);
    }
    process.exit(0);
  });
}
/* c8 ignore stop */
