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

const ALLOWED_MERGE_BASES = new Set(["dev"]);
const ALLOWED_REPO = "marcus100/grenmet";
// A PR that changes the files which limit the agents, or the CI and ruleset
// files that gate merges, is merged by the owner and never by an agent.
const OWNER_ONLY_PATHS = [
  /^\.claude\//,
  /^\.codex\//,
  /^\.agents\//,
  /^\.husky\//,
  /^\.github\//,
  /^infra\/github\//,
  /^scripts\/(?:guardrails|verification)\//,
  /^package\.json$/,
  /^docs\/agents\/routines\.md$/,
  /^apps\/api\/fastapi\/src\/auth\/permissions\.py$/,
  /(?:^|\/)AGENTS\.md$/,
];
// Merge routes other than `gh pr merge`: GraphQL mutations, branch merges and
// the REST merge endpoint. Tested on text with the quotes removed.
const API_MERGE_KEYWORDS = /merge/i;
const API_OPAQUE_QUERY = /mutation|=@/i;
const RETARGETS_PR = /\bgh pr edit\b[^;&|]*\s(?:--base|-B)\b/;
// Variables that point gh or git at another repository, host or identity.
const REPO_ENV =
  /\b(?:GH_REPO|GH_HOST|GH_TOKEN|GITHUB_TOKEN|GIT_DIR|GIT_WORK_TREE|GH_CONFIG_DIR)=/;
const CHANGES_DIRECTORY = /(?:^|\s)(?:cd|pushd)\s/;
// Commands are split at these, the way the shell separates simple commands.
const SUBCOMMAND_SPLIT = /&&|\|\||\|&|\$\(|[;|&\n(){}`]/;
// Words that run or prefix the next command (`xargs gh pr merge`,
// `timeout 60 gh pr merge`, `if true; then gh pr merge`, `! gh pr merge`).
const COMMAND_WRAPPERS = new Set([
  "!",
  "builtin",
  "chrt",
  "command",
  "do",
  "else",
  "elif",
  "env",
  "exec",
  "if",
  "ionice",
  "nice",
  "nohup",
  "setsid",
  "stdbuf",
  "sudo",
  "taskset",
  "then",
  "time",
  "timeout",
  "unbuffer",
  "until",
  "while",
  "xargs",
]);
const WRAPPER_NUMBER = /^\d+(?:\.\d+)?[smhd]?$/;
const GH_COMMAND = /^(?:.*\/)?gh$/;
const REDIRECT = /^\d*>>?(?:&\d+|\S*)$/;
const REDIRECT_WITHOUT_TARGET = /^\d*>>?$/;
const ENV_ASSIGNMENT = /^\w+=/;
const PR_NUMBER = /^\d+$/;
const PR_URL = /^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/\d+\/?$/i;
const COMMIT_SHA = /^[0-9a-f]{6,40}$/i;
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

/**
 * The command plus every command nested in a shell wrapper. Quoted text is
 * stripped by default; the gh checks ask for the raw text (`strip` false)
 * because a quoted word such as `gh pr "merge"` is still the command.
 */
function executedSegments(command, depth = 0, strip = true) {
  const { outer, executed } = separateHeredocs(command);
  const segments = [strip ? stripQuotedLiterals(outer) : outer];
  if (depth >= MAX_WRAPPER_DEPTH) return segments;
  for (const body of executed) {
    segments.push(...executedSegments(body, depth + 1, strip));
  }
  for (const match of outer.matchAll(SHELL_WRAPPER)) {
    segments.push(...executedSegments(unquote(match[1]), depth + 1, strip));
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
    } else if (arg.startsWith("-R") && arg.length > 2) {
      repo = arg.slice(2).replace(/^=/, "");
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

/** Files a PR changes; null when GitHub can't say. */
export function lookupMergeFiles(args) {
  const { prRef, repo } = parseMergeTarget(args);
  const repoArgs = repo === undefined ? [] : ["--repo", repo];
  const result = spawnSync(
    "gh",
    ["pr", "diff", ...(prRef ? [prRef] : []), ...repoArgs, "--name-only"],
    { encoding: "utf8", timeout: GH_LOOKUP_TIMEOUT_MS }
  );
  return result.status === 0
    ? result.stdout.split("\n").filter((file) => file.trim() !== "")
    : null;
}

/** A subcommand's words as the shell sees them: quotes and line breaks removed. */
function shellWords(subcommand) {
  return subcommand
    .replace(/\\\n/g, "")
    .replace(/["'\\]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** The words after `gh` when this command runs it (also through env, xargs, sudo…). */
function ghArguments(words) {
  let index = 0;
  let wrapped = false;
  while (index < words.length) {
    const word = words[index];
    if (ENV_ASSIGNMENT.test(word) || COMMAND_WRAPPERS.has(word)) {
      wrapped = true;
    } else if (
      !(wrapped && (word.startsWith("-") || WRAPPER_NUMBER.test(word)))
    ) {
      break;
    }
    index++;
  }
  return GH_COMMAND.test(words[index] ?? "")
    ? words.slice(index + 1)
    : undefined;
}

/**
 * The arguments of `gh pr merge` when this `gh` command is one, with a `-R`
 * flag given before `merge` moved in front of the rest; otherwise undefined.
 */
function prMergeArguments(gh) {
  if (gh[0] !== "pr") return undefined;
  const flags = [];
  let index = 1;
  while (index < gh.length) {
    const word = gh[index];
    if (word === "-R" || word === "--repo") {
      flags.push(word, gh[index + 1] ?? "");
      index += 2;
    } else if (word.startsWith("--repo=") || word.startsWith("-R")) {
      flags.push(word);
      index += 1;
    } else {
      break;
    }
  }
  return gh[index] === "merge" ? [...flags, ...gh.slice(index + 1)] : undefined;
}

/**
 * The only accepted shape of `gh pr merge`:
 *   gh pr merge <number|url> [--repo Marcus100/grenmet] [--merge]
 *     [--delete-branch] --match-head-commit <sha>
 * Anything else (--admin, --auto, --squash, --body, an extra word) is returned
 * as `problem`.
 */
function parsePrMerge(words) {
  let ref;
  let repo;
  let sha;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (REDIRECT.test(word)) {
      // `>/dev/null`, `2>&1` and `> file` redirect output; they merge nothing.
      if (REDIRECT_WITHOUT_TARGET.test(word)) index++;
      continue;
    }
    if (["--merge", "-m", "--delete-branch", "-d"].includes(word)) continue;
    if (word === "--match-head-commit") {
      sha = words[++index];
    } else if (word.startsWith("--match-head-commit=")) {
      sha = word.slice("--match-head-commit=".length);
    } else if (word === "-R" || word === "--repo") {
      repo = words[++index] ?? "";
    } else if (word.startsWith("--repo=")) {
      repo = word.slice("--repo=".length);
    } else if (word.startsWith("-R") && word.length > 2) {
      repo = word.slice(2).replace(/^=/, "");
    } else if (!word.startsWith("-") && ref === undefined) {
      ref = word;
    } else {
      return { problem: word };
    }
  }
  return { ref, repo, sha };
}

/**
 * `gh pr merge` is allowed only as the exact shape in parsePrMerge, into dev
 * (AGENTS.md: agents merge their own green, reviewed PRs into dev; the owner
 * merges staging and main), only in this repository, and never for a PR that
 * changes the files in OWNER_ONLY_PATHS. Fails closed: an unknown base or file
 * list blocks.
 */
function findBlockedPrMerge(words, whole, { lookupBase, lookupFiles }) {
  const text = whole.join(" ");
  if (REPO_ENV.test(text)) {
    return "gh pr merge with GH_REPO set (the merge could hit another repository)";
  }
  if (RETARGETS_PR.test(text)) {
    return "gh pr edit --base chained with gh pr merge (retargets the PR before the merge)";
  }
  if (CHANGES_DIRECTORY.test(text)) {
    return "gh pr merge after cd or pushd (it would run in another directory)";
  }
  const { problem, ref, repo, sha } = parsePrMerge(words);
  if (problem !== undefined) {
    return `gh pr merge with '${problem}' (agents may only run: gh pr merge <number> --merge --match-head-commit <sha>)`;
  }
  // Both the --repo flag and the repository inside a PR URL must be ours.
  for (const named of [repo, PR_URL.exec(ref ?? "")?.[1]]) {
    if (named !== undefined && named.toLowerCase() !== ALLOWED_REPO) {
      return `gh pr merge in '${named}' (only ${ALLOWED_REPO} merges are authorized)`;
    }
  }
  if (!(ref && (PR_NUMBER.test(ref) || PR_URL.test(ref)))) {
    return "gh pr merge without a PR number or URL (the PR must be named in the command)";
  }
  if (!(sha && COMMIT_SHA.test(sha))) {
    return "gh pr merge without --match-head-commit <sha> (the merge must be pinned to the reviewed head)";
  }
  const lookupArgs = [ref, ...(repo === undefined ? [] : ["--repo", repo])];
  const base = lookupBase(lookupArgs);
  if (!ALLOWED_MERGE_BASES.has(base)) {
    return `gh pr merge into '${base ?? "unknown base"}' (only dev merges are authorized; the owner merges staging and main)`;
  }
  const files = lookupFiles(lookupArgs);
  if (files === null) {
    return "gh pr merge with an unknown file list (the owner-only paths could not be checked)";
  }
  const ownerOnly = files.find((file) =>
    OWNER_ONLY_PATHS.some((pattern) => pattern.test(file))
  );
  if (ownerOnly) {
    return `gh pr merge of a PR that changes '${ownerOnly}' (the owner merges changes to agent limits, CI and rulesets)`;
  }
  return undefined;
}

/** Text with %xx escapes decoded, as GitHub's API path handling reads them. */
function decodeEscapes(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Looks at the raw text of each simple command (quotes removed the way the
 * shell would): `gh pr merge`, `gh api` merge routes and `gh alias`, which
 * could rename a blocked command.
 */
function findBlockedGh(segment, lookups) {
  // The shell deletes a backslash-newline before it splits words, so
  // `gh pr \<newline>merge` is one command.
  const rawSegment = segment.replace(/\\\n/g, "");
  const whole = shellWords(rawSegment);
  for (const subcommand of rawSegment.split(SUBCOMMAND_SPLIT)) {
    const gh = ghArguments(shellWords(subcommand));
    if (!gh) continue;
    const [area] = gh;
    if (area === "alias") {
      return "gh alias (it could rename a blocked command)";
    }
    if (area === "api") {
      // Any mention of "merge" in a request, with percent-escapes decoded, or
      // a GraphQL query the hook cannot read (a mutation, or one read from a
      // file), could be a merge that skips the dev-only rule.
      const request = decodeEscapes(gh.join(" "));
      if (
        API_MERGE_KEYWORDS.test(request) ||
        (gh.includes("graphql") &&
          (API_OPAQUE_QUERY.test(request) || gh.includes("--input")))
      ) {
        return "gh api merge (GraphQL mutation, branch merge or REST merge skips the dev-only rule)";
      }
    }
    const mergeArguments = prMergeArguments(gh);
    if (mergeArguments) {
      const hit = findBlockedPrMerge(mergeArguments, whole, lookups);
      if (hit) return hit;
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
  { lookupBase = lookupMergeBase, lookupFiles = lookupMergeFiles } = {}
) {
  for (const raw of executedSegments(command, 0, false)) {
    const hit = findBlockedGh(raw, { lookupBase, lookupFiles });
    if (hit) return hit;
  }
  for (const segment of executedSegments(command)) {
    const hit =
      DANGEROUS_PATTERNS.find((pattern) => pattern.test(segment)) ??
      findDiscardingRestore(segment);
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
