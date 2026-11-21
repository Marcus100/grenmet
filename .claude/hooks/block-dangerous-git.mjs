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
];
// A REST merge. findBlockedGh checks the one accepted shape; any other
// occurrence (behind a wrapper the word scan does not know) is blocked.
const REST_MERGE_ROUTE = new RegExp(
  `\\bgh\\s+api\\b${SAME_COMMAND}/pulls/\\d+/merge\\b`,
  "g"
);

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
// Flags before `-c` may be combined (`-lc`, `-ec`) or long (`--login -c`).
const SHELL_WRAPPER =
  /\b(?:(?:ba|z|da|k|mk|tc|c|fi)?sh\s+(?:(?:-[a-zA-Z]+|--[a-zA-Z][\w-]*|[-+]o\s+\w+)\s+)*-[a-zA-Z]*c|eval)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
// Runners whose argument is code the hook cannot read: an interpreter's
// inline script, `find -exec`, `xargs`, `parallel`, `su -c`, `docker exec`.
// Tested on text with quotes removed, so a commit message that names one does
// not count.
const OPAQUE_RUNNER =
  /(?:^|[\s;&|(])(?:(?:\S*\/)?(?:python[\d.]*|pypy[\d.]*|node|nodejs|perl|ruby|php|deno|bun|lua|Rscript|pwsh|powershell|osascript)\b[^;&|\n]*?\s(?:-[a-zA-Z]*[ceE]|--eval|--exec|--command|-Command|run)\b|find\b[^;&|\n]*\s-(?:exec|execdir|ok|okdir)\b|xargs\b|parallel\b|su\b[^;&|\n]*\s-c\b|script\b[^;&|\n]*\s-c\b|(?:docker|podman)\b[^;&|\n]*\bexec\b|(?:ba|z|da)?sh\s+-s\b)/;
// What such a runner must not carry: a git push, a git alias or config write,
// or any gh command. Tested on the text with quotes kept.
const MENTIONS_PUSH_OR_GH =
  /\bgit\b[\s\S]*\b(?:push|config)\b|\bgh\b|\bsend-pack\b|\bhttp-push\b/;
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
// Enforcement files: the hooks and settings an agent session runs under, CI,
// rulesets, Codex rules and the guardrail scripts. An agent never merges a PR
// that changes one, whatever its body says; the owner merges it (owner
// decision, 21 Nov 2026). protect-files.mjs also refuses agent edits to the
// hooks, settings and Codex files. pnpm-workspace.yaml, .npmrc and
// pnpm-lock.yaml are owner-only when the PR also changes a workflow; every
// .github/ change is already owner-only, so they need no rule of their own.
const OWNER_ONLY_PATHS = [
  /^\.claude\/hooks\//,
  /^\.claude\/settings(?:\.local)?\.json$/,
  /^\.codex\//,
  /^\.agents\/(?:.*\/)?[^/]*settings[^/]*$/,
  /^scripts\/agents\/settings\//,
  /^\.github\//,
  /^infra\/github\//,
  /(?:^|\/)CODEOWNERS$/,
  /^\.husky\//,
  /^package\.json$/,
  // Guardrail scripts that enforce (their tests are in the review lane).
  /^scripts\/guardrails\/(?!.*\.test\.mjs$)/,
  /^scripts\/verification\//,
];
// Agent rules: skills, role briefs, agent docs, the root AGENTS.md and the
// guardrail tests. An agent may merge a PR that changes them into dev only
// when the PR body carries both review lines for the exact head being merged:
// a clean Claude security review and a clean Codex review.
const SAFETY_PATHS = [
  /^\.claude\//,
  /^\.agents\//,
  /^docs\/agents\//,
  // Only the root AGENTS.md sets the agents' own rules. Per-area AGENTS.md notes
  // and the permission catalogue are ordinary code: agents merge them after a
  // fresh-context code review (and a security review for risk:high).
  /^AGENTS\.md$/,
  /^scripts\/guardrails\//,
];
// The two lines a safety-file PR carries in its body, each alone on its line
// and each ending in the full head sha:
//   Security review: no open findings (<reviewer>, <full head sha>)
//   Codex review: no blocking findings (<full head sha>)
const REVIEW_LINES = [
  {
    name: "Security review",
    pattern:
      /^Security review: no open findings \([^(),\s][^(),]*, ([0-9a-f]{40})\)$/i,
    example: (sha) =>
      `Security review: no open findings (security-reviewer, ${sha})`,
  },
  {
    name: "Codex review",
    pattern: /^Codex review: no blocking findings \(([0-9a-f]{40})\)$/i,
    example: (sha) => `Codex review: no blocking findings (${sha})`,
  },
];
const FULL_SHA = /^[0-9a-f]{40}$/i;
const REST_MERGE_PATH = /^\/?repos\/([^/\s]+\/[^/\s]+)\/pulls\/(\d+)\/merge\/?$/i;
const REST_FIELD_FLAGS = new Set(["-f", "-F", "--field", "--raw-field"]);
// API paths a write may not touch except through the one accepted merge: a
// PR's own endpoints (retargeting, closing, reviews), refs and tags, file
// contents (a commit straight onto a branch), branch settings and merges.
const API_WRITE_TARGET =
  /(?:^|\/)(?:pulls\/[^\s?]+|git\/(?:refs|tags)(?:[/?]|$)|contents(?:[/?]|$)|branches\/[^\s?]+|merges(?:[/?]|$)|merge-upstream(?:[/?]|$))/i;
const READ_METHODS = new Set(["GET", "HEAD"]);
// `git config` keys that rename a command or change where a push goes.
const REROUTING_CONFIG = /^(?:alias\.|remote\..+\.(?:push|pushurl|url)$|url\..+\.(?:push)?insteadof$|push\.default$|branch\..+\.(?:remote|merge|pushremote)$|remote\.pushdefault$)/i;
const CONFIG_READ_FLAGS =
  /^(?:--get|--get-all|--get-regexp|--get-urlmatch|--list|-l|--unset|--unset-all|--show-origin|--show-scope|--name-only)$/;
// Agents never push to these branches; work lands through a PR into dev.
const PROTECTED_BRANCHES = new Set(["dev", "staging", "main"]);
// `git` options that take a separate value, before the subcommand.
const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
]);
const PUSH_FLAGS_WITH_VALUE = new Set([
  "--repo",
  "-o",
  "--push-option",
  "--receive-pack",
  "--exec",
]);
// Push flags that publish tags or every branch, or delete remote refs.
const PUSH_TAG_FLAGS = new Set(["--tags", "--follow-tags", "--mirror"]);
const PUSH_ALL_FLAGS = new Set(["--all", "--branches"]);
const PUSH_DELETE_FLAGS = new Set(["--delete", "-d", "--prune"]);
const SHORT_FLAGS = /^-[a-zA-Z]+$/;
// A refspec the hook cannot read: a variable or a wildcard.
const OPAQUE_REFSPEC = /[$*]/;
const SEPARATORS_IN_QUOTES = /[;&|\n(){}]/g;
const RUNS_INSIDE_QUOTES = /\$\(|`/;
// The machine's memory guard prefixes heavy commands (`heavy git push …`).
const HEAVY_WRAPPER = /(?:^|\/)heavy$/;
const GIT_LOOKUP_TIMEOUT_MS = 5000;
const PUSHES_TO_UPSTREAM = /^(?:upstream|tracking)$/;
const PUSHES_EVERY_BRANCH = /^matching$/;
// Merge routes other than `gh pr merge`: GraphQL mutations, branch merges and
// the REST merge endpoint. Tested on text with the quotes removed.
const API_MERGE_KEYWORDS = /merge/i;
// A GraphQL query the hook cannot read: a mutation, a file (`=@`), or text built
// at run time (`$(cat q)`, `$Q`, a backtick).
const API_OPAQUE_QUERY = /mutation|=@|[$`]/i;
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
const GIT_COMMAND = /^(?:.*\/)?git$/;
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
const CHANGED_FILES_COUNT = /^\d+$/;

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

/**
 * One field of a PR, read over REST (`gh pr view` needs GraphQL, which the
 * cloud sandbox blocks); null when GitHub can't say.
 */
function lookupPullField(args, jq, spawn) {
  const { prRef, repo } = parseMergeTarget(args);
  const number = /(\d+)\/?$/.exec(prRef ?? "")?.[1];
  if (number === undefined) return null;
  const slug = repo ?? PR_URL.exec(prRef ?? "")?.[1] ?? "{owner}/{repo}";
  const result = spawn("gh", ["api", `repos/${slug}/pulls/${number}`, "--jq", jq], {
    encoding: "utf8",
    timeout: GH_LOOKUP_TIMEOUT_MS,
  });
  return result.status === 0 && typeof result.stdout === "string"
    ? result.stdout
    : null;
}

/** Ask GitHub which branch a PR merges into; null when it can't tell. */
export function lookupMergeBase(args, spawn = spawnSync) {
  return lookupPullField(args, ".base.ref", spawn)?.trim() || null;
}

/** Ask GitHub for a PR's current head commit; null when it can't tell. */
export function lookupMergeHead(args, spawn = spawnSync) {
  const sha = lookupPullField(args, ".head.sha", spawn)?.trim() ?? "";
  return FULL_SHA.test(sha) ? sha : null;
}

/**
 * Base, head and body of a PR in one request, so all three describe the same
 * moment; null when GitHub can't say.
 */
export function lookupPull(args, spawn = spawnSync) {
  const text = lookupPullField(
    args,
    '{base: .base.ref, head: .head.sha, body: (.body // "")}',
    spawn
  );
  try {
    const pull = JSON.parse(text ?? "");
    return typeof pull?.base === "string" &&
      typeof pull?.head === "string" &&
      typeof pull?.body === "string"
      ? pull
      : null;
  } catch {
    return null;
  }
}

/**
 * Every path a PR touches, including the old name of a renamed file (moving a
 * workflow or AGENTS.md out of an owner-only path must remain visible); null when
 * GitHub can't say.
 */
export function lookupMergeFiles(args, spawn = spawnSync) {
  const { prRef, repo } = parseMergeTarget(args);
  const number = /(\d+)\/?$/.exec(prRef ?? "")?.[1];
  if (number === undefined) return null;
  const slug = repo ?? PR_URL.exec(prRef ?? "")?.[1] ?? "{owner}/{repo}";
  const countResult = spawn(
    "gh",
    ["api", `repos/${slug}/pulls/${number}`, "--jq", ".changed_files"],
    { encoding: "utf8", timeout: GH_LOOKUP_TIMEOUT_MS }
  );
  const countText = countResult.stdout?.trim() ?? "";
  if (
    countResult.status !== 0 ||
    !CHANGED_FILES_COUNT.test(countText) ||
    Number(countText) > 3000
  )
    return null;
  const changedFiles = Number(countText);
  const result = spawn(
    "gh",
    [
      "api",
      `repos/${slug}/pulls/${number}/files`,
      "--paginate",
      "--slurp",
    ],
    { encoding: "utf8", timeout: GH_LOOKUP_TIMEOUT_MS }
  );
  if (result.status !== 0) return null;
  try {
    const files = JSON.parse(result.stdout).flat();
    if (
      !Array.isArray(files) ||
      files.length !== changedFiles ||
      files.some(
        (file) => {
          const previousFilename = file?.previous_filename;
          const hasPreviousFilename = Object.hasOwn(file ?? {}, "previous_filename");
          return !(
            typeof file?.filename === "string" &&
            file.filename.length > 0 &&
            (!hasPreviousFilename ||
              (typeof previousFilename === "string" &&
                previousFilename.length > 0)) &&
            (file.status !== "renamed" ||
              (typeof previousFilename === "string" &&
                previousFilename.length > 0))
          );
        }
      )
    )
      return null;
    return files.flatMap((file) =>
      file.status === "renamed"
        ? [file.filename, file.previous_filename]
        : file.previous_filename === undefined
          ? [file.filename]
          : [file.filename, file.previous_filename]
    );
  } catch {
    return null;
  }
}

/** Ask GitHub for a PR's description; null when it can't tell. */
export function lookupMergeBody(args, spawn = spawnSync) {
  return lookupPullField(args, '.body // ""', spawn);
}

/**
 * The review lines a PR body still lacks for this head (empty when both are
 * there). Each line stands alone, and its sha must equal the
 * `--match-head-commit` sha. GitHub refuses the merge when that sha is not the
 * PR head, so a line written for an earlier head stops counting as soon as
 * anything new is pushed.
 */
export function missingReviewLines(body, sha) {
  if (!(typeof body === "string" && FULL_SHA.test(sha ?? ""))) {
    return REVIEW_LINES.map((line) => line.example(sha ?? "<full head sha>"));
  }
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  return REVIEW_LINES.filter(
    ({ pattern }) =>
      !lines.some(
        (line) => pattern.exec(line)?.[1].toLowerCase() === sha.toLowerCase()
      )
  ).map((line) => line.example(sha));
}

/**
 * What a push from `dir` would update: `head` is the branch checked out, and
 * `bare` lists the branches a `git push` without a refspec could reach (the
 * branch itself, plus its upstream when push.default sends pushes there).
 * Empty when git can't say.
 */
export function lookupPushTargets(dir, spawn = spawnSync) {
  const run = (args) => {
    const result = spawn("git", [...(dir ? ["-C", dir] : []), ...args], {
      encoding: "utf8",
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    return result.status === 0 ? (result.stdout ?? "").trim() : "";
  };
  const head = run(["symbolic-ref", "--short", "-q", "HEAD"]);
  const bare = [head];
  const pushDefault = run(["config", "--get", "push.default"]);
  // A configured push refspec or `push.default matching` sends a bare push
  // somewhere the command does not name.
  const configured =
    PUSHES_EVERY_BRANCH.test(pushDefault) ||
    run(["config", "--get-regexp", "^remote\\..*\\.push$"]) !== "";
  if (PUSHES_TO_UPSTREAM.test(pushDefault)) {
    const upstream = run([
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
    bare.push(upstream.slice(upstream.indexOf("/") + 1));
  }
  return { head, bare: bare.filter(Boolean), configured };
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

/** The words after `gh` (or `git`) when this command runs it (also through env, xargs, sudo, heavy…). */
function ghArguments(words, program = GH_COMMAND) {
  let index = 0;
  let wrapped = false;
  while (index < words.length) {
    const word = words[index];
    if (
      ENV_ASSIGNMENT.test(word) ||
      COMMAND_WRAPPERS.has(word) ||
      HEAVY_WRAPPER.test(word)
    ) {
      wrapped = true;
    } else if (
      !(wrapped && (word.startsWith("-") || WRAPPER_NUMBER.test(word)))
    ) {
      break;
    }
    index++;
  }
  return program.test(words[index] ?? "")
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
 * merges staging and main), only in this repository. A PR that changes a
 * safety file also needs both review lines for its head. Fails closed:
 * an unknown base, file list or PR body blocks.
 */
function findBlockedPrMerge(words, whole, lookups) {
  const hit = findUnsafeMergeContext(whole);
  if (hit) return hit;
  const { problem, ref, repo, sha } = parsePrMerge(words);
  if (problem !== undefined) {
    return `gh pr merge with '${problem}' (agents may only run: gh pr merge <number> --repo Marcus100/grenmet --merge --match-head-commit <full sha>)`;
  }
  // The repository is named in the command, so the lookups below and the merge
  // read the same PR wherever the command runs.
  if (repo === undefined) {
    return "gh pr merge without --repo Marcus100/grenmet (name the repository in the command)";
  }
  return findBlockedMergeTarget({ ref, repo, sha }, lookups);
}

/** Things around a merge command that could point it somewhere else. */
function findUnsafeMergeContext(whole) {
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
  return undefined;
}

/**
 * The rules every agent merge meets, whichever command asks for it: this
 * repository, a named PR, a pinned head, base dev, and both review lines when
 * the PR changes a safety file.
 */
function findBlockedMergeTarget(
  { ref, repo, sha },
  { lookupBase, lookupFiles, lookupBody, lookupHead }
) {
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
  if (!FULL_SHA.test(sha)) {
    return "gh pr merge with a short sha (pin the merge with --match-head-commit <full 40-character head sha>)";
  }
  const lookupArgs = [ref, ...(repo === undefined ? [] : ["--repo", repo])];
  const base = lookupBase(lookupArgs);
  if (!ALLOWED_MERGE_BASES.has(base)) {
    return `gh pr merge into '${base ?? "unknown base"}' (only dev merges are authorized; the owner merges staging and main)`;
  }
  const head = lookupHead(lookupArgs);
  if (head === null) {
    return "gh pr merge with an unknown PR head (the head commit could not be checked)";
  }
  if (head.toLowerCase() !== sha.toLowerCase()) {
    return `gh pr merge of ${sha} while the PR head is ${head} (review and pin the current head)`;
  }
  const files = lookupFiles(lookupArgs);
  if (files === null) {
    return "gh pr merge with an unknown file list (the safety paths could not be checked)";
  }
  const ownerOnly = files.find((file) =>
    OWNER_ONLY_PATHS.some((pattern) => pattern.test(file))
  );
  if (ownerOnly !== undefined) {
    return `gh pr merge of a PR that changes '${ownerOnly}' (an enforcement file: hooks, settings, Codex rules, CI, rulesets or guardrail scripts; the owner merges these)`;
  }
  const safetyFile = files.find((file) =>
    SAFETY_PATHS.some((pattern) => pattern.test(file))
  );
  if (safetyFile === undefined) return undefined;
  const body = lookupBody(lookupArgs);
  if (body === null) {
    return `gh pr merge of a PR that changes '${safetyFile}' with an unknown PR body (the review lines could not be checked)`;
  }
  const missing = missingReviewLines(body, sha);
  if (missing.length > 0) {
    return `gh pr merge of a PR that changes '${safetyFile}' without both review lines for this head (after a clean security-reviewer pass and a clean Codex review of this exact head, the PR body needs: ${missing.join(" and ")})`;
  }
  return undefined;
}

/**
 * The only accepted REST merge, for sandboxes where `gh pr merge` is blocked:
 *   gh api -X PUT repos/Marcus100/grenmet/pulls/<number>/merge
 *     -f sha=<full head sha> -f merge_method=merge
 * It meets the same rules as `gh pr merge`. Returns undefined when the request
 * is not a call to a PR merge endpoint, `{ hit }` when it is (hit undefined
 * means allowed).
 */
function findBlockedRestMerge(gh, whole, lookups) {
  const words = gh.slice(1).map(decodeEscapes);
  const route = words.find((word) => REST_MERGE_PATH.test(word));
  if (route === undefined) return undefined;
  const [, slug, number] = REST_MERGE_PATH.exec(route);
  const context = findUnsafeMergeContext(whole);
  if (context) return { hit: context };
  const fields = {};
  let method;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (word === route) continue;
    if (REDIRECT.test(word)) {
      if (REDIRECT_WITHOUT_TARGET.test(word)) index++;
    } else if (word === "-X" || word === "--method") {
      method = words[++index];
    } else if (word.startsWith("--method=")) {
      method = word.slice("--method=".length);
    } else if (REST_FIELD_FLAGS.has(word)) {
      const [key, ...value] = (words[++index] ?? "").split("=");
      if (Object.hasOwn(fields, key)) return { hit: restProblem(key) };
      fields[key] = value.join("=");
    } else if (word === "--jq" || word === "-q") {
      index++;
    } else if (word !== "--silent") {
      return { hit: restProblem(word) };
    }
  }
  const extra = Object.keys(fields).find(
    (key) => key !== "sha" && key !== "merge_method"
  );
  if (extra !== undefined) return { hit: restProblem(extra) };
  if (method?.toUpperCase() !== "PUT" || fields.merge_method !== "merge") {
    return { hit: restProblem("a method other than PUT with merge_method=merge") };
  }
  if (!FULL_SHA.test(fields.sha ?? "")) {
    return {
      hit: "gh api merge without sha=<full 40-character head sha> (the merge must be pinned to the reviewed head)",
    };
  }
  return {
    hit: findBlockedMergeTarget(
      { ref: number, repo: slug, sha: fields.sha },
      lookups
    ),
  };
}

/** The HTTP method a `gh api` call uses: `-X`, or POST when it sends fields. */
function apiMethod(words) {
  let method;
  let sendsFields = false;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (word === "-X" || word === "--method") method = words[index + 1];
    else if (word.startsWith("--method=")) method = word.slice(9);
    else if (word.startsWith("-X") && word.length > 2) method = word.slice(2);
    else if (REST_FIELD_FLAGS.has(word) || word === "--input") sendsFields = true;
    else if (/^-[fF]./.test(word) || /^--(?:field|raw-field|input)=/.test(word))
      sendsFields = true;
  }
  return (method ?? (sendsFields ? "POST" : "GET")).toUpperCase();
}

/**
 * A `gh api` write to a PR, a ref, a tag, file contents or branch settings.
 * Creating a PR (`POST repos/<o>/<r>/pulls`) and commenting on issues stay
 * allowed; the one accepted merge is checked before this.
 */
function findBlockedApiWrite(gh) {
  const words = gh.slice(1).map(decodeEscapes);
  const method = apiMethod(words);
  if (READ_METHODS.has(method)) return undefined;
  const target = words.find(
    (word) => !word.startsWith("-") && API_WRITE_TARGET.test(word)
  );
  return target === undefined
    ? undefined
    : `gh api ${method} ${target} (agents do not write PRs, refs, tags, branch settings or file contents through the API)`;
}

function restProblem(what) {
  return `gh api merge with '${what}' (agents may only run: gh api -X PUT repos/Marcus100/grenmet/pulls/<number>/merge -f sha=<full head sha> -f merge_method=merge)`;
}

/**
 * Quoted text is one argument, so a `;` or line break inside it does not start
 * a command. Double quotes that hold `$(…)` or a backtick are left alone: that
 * text runs.
 */
function neutraliseQuotedSeparators(segment) {
  return segment.replace(QUOTED_LITERAL, (literal) =>
    literal.startsWith('"') && RUNS_INSIDE_QUOTES.test(literal)
      ? literal
      : literal.replace(SEPARATORS_IN_QUOTES, " ")
  );
}

/**
 * A git command's parts when this command runs git: the `-C` directory, the
 * `-c` and `--config-env` keys, the subcommand and its arguments.
 */
function gitArguments(words) {
  const git = ghArguments(words, GIT_COMMAND);
  if (!git) return undefined;
  let dir;
  const configs = [];
  let index = 0;
  while (index < git.length && git[index].startsWith("-")) {
    const word = git[index];
    if (word === "-C") dir = git[index + 1];
    if (word === "-c" || word === "--config-env") {
      configs.push((git[index + 1] ?? "").split("=")[0]);
    } else if (word.startsWith("--config-env=")) {
      configs.push(word.slice(13).split("=")[0]);
    } else if (word.startsWith("-c") && word.length > 2) {
      configs.push(word.slice(2).split("=")[0]);
    }
    index += GIT_OPTIONS_WITH_VALUE.has(word) ? 2 : 1;
  }
  return {
    dir,
    configs,
    sub: git[index],
    args: git.slice(index + 1),
    // The words before `git` (wrappers such as env, sudo, heavy or xargs).
    viaXargs: words.slice(0, words.length - git.length - 1).includes("xargs"),
  };
}

/** The words after `git push`, and the `-C` directory, when this command is one. */
function pushArguments(words) {
  const git = gitArguments(words);
  return git?.sub === "push" ? git : undefined;
}

/**
 * Git configuration that renames a command or reroutes a push: `git -c alias.*`
 * on any command, and a `git config` write of such a key.
 */
function findBlockedGitConfig(segment) {
  const rawSegment = neutraliseQuotedSeparators(segment).replace(/\\\n/g, "");
  for (const subcommand of rawSegment.split(SUBCOMMAND_SPLIT)) {
    const git = gitArguments(shellWords(subcommand));
    if (!git) continue;
    const alias = git.configs.find((key) => /^alias\./i.test(key));
    if (alias !== undefined) {
      return `git -c ${alias} (an inline alias could rename a blocked command)`;
    }
    if (git.sub === "config") {
      const key = git.args.find((arg) => REROUTING_CONFIG.test(arg));
      const reads = git.args.some((arg) => CONFIG_READ_FLAGS.test(arg));
      if (key !== undefined && !reads) {
        return `git config ${key} (it could rename a command or change where a push goes)`;
      }
    }
  }
  return undefined;
}

/**
 * Why one refspec may not be pushed, if it may not. The destination is the part
 * after `:`, or the source when there is none.
 */
function findBlockedRefspec(refspec, currentBranches) {
  if (refspec === undefined) {
    const targets = currentBranches();
    if (targets.configured) {
      return "git push without a branch while git config sets where pushes go (remote.<name>.push or push.default matching); name the task branch";
    }
    const hit = targets.bare.find((name) => PROTECTED_BRANCHES.has(name));
    return hit === undefined
      ? undefined
      : `git push without a branch while on '${hit}' (agents never push dev, staging or main; push the task branch and open a PR into dev)`;
  }
  const spec = refspec.replace(/^\+/, "");
  if (OPAQUE_REFSPEC.test(spec)) {
    return `git push of '${refspec}' (a variable or wildcard hides the destination; name the task branch)`;
  }
  const colon = spec.indexOf(":");
  const source = colon === -1 ? spec : spec.slice(0, colon);
  const destination = colon === -1 ? spec : spec.slice(colon + 1);
  if (colon !== -1 && source === "") {
    return `git push of '${refspec}' (it deletes a remote branch or tag; the owner deletes)`;
  }
  if (
    spec === "tag" ||
    source.startsWith("refs/tags/") ||
    destination.startsWith("refs/tags/")
  ) {
    return `git push of '${refspec}' (the owner publishes tags and releases)`;
  }
  const names =
    destination === "HEAD" || destination === "@"
      ? [currentBranches().head]
      : [destination.replace(/^refs\/heads\//, "")];
  const hit = names.find((name) => PROTECTED_BRANCHES.has(name));
  return hit === undefined
    ? undefined
    : `git push to '${hit}' (agents never push dev, staging or main; push the task branch and open a PR into dev)`;
}

/**
 * `git push` may only send a task branch: never dev, staging or main (by name,
 * as `HEAD:dev`, as `refs/heads/dev` or as the branch a bare push would
 * update), never tags, never a deletion.
 *
 * Known gaps (GitHub's branch and tag rulesets are the hard layer): a tag
 * pushed by its bare name (`git push origin v1.2.3`), a destination set only in
 * git config (`remote.<name>.push`, `push.default matching`), and a bare push
 * after `cd` into another checkout.
 */
function findBlockedPush(segment, { lookupTargets, cwd }) {
  const rawSegment = neutraliseQuotedSeparators(segment).replace(/\\\n/g, "");
  // Scanned twice: as written (a push inside `$(…)` is still a push), and with
  // each `$(…)` turned into a variable, so a destination built at run time
  // reads as one unreadable refspec instead of vanishing.
  const subcommands = [
    ...rawSegment.split(SUBCOMMAND_SPLIT),
    ...rawSegment.replace(COMMAND_SUBSTITUTION, "$SUBST").split(SUBCOMMAND_SPLIT),
  ];
  for (const subcommand of subcommands) {
    const push = pushArguments(shellWords(subcommand));
    if (!push) continue;
    if (push.viaXargs) {
      return "git push through xargs (its arguments are not in the command)";
    }
    const refs = [];
    // With --repo the remote is named by the flag, so every word is a refspec.
    let remoteNamed = false;
    for (let index = 0; index < push.args.length; index++) {
      const word = push.args[index];
      if (REDIRECT.test(word)) {
        if (REDIRECT_WITHOUT_TARGET.test(word)) index++;
      } else if (word === "--repo" || word.startsWith("--repo=")) {
        remoteNamed = true;
        if (word === "--repo") index++;
      } else if (PUSH_FLAGS_WITH_VALUE.has(word)) {
        index++;
      } else if (PUSH_TAG_FLAGS.has(word)) {
        return `git push ${word} (the owner publishes tags and releases)`;
      } else if (PUSH_ALL_FLAGS.has(word)) {
        return `git push ${word} (it pushes every branch, dev, staging and main included)`;
      } else if (
        PUSH_DELETE_FLAGS.has(word) ||
        (SHORT_FLAGS.test(word) && word.includes("d"))
      ) {
        return `git push ${word} (it deletes remote branches or tags; the owner deletes)`;
      } else if (!word.startsWith("-")) {
        refs.push(word);
      }
    }
    const currentBranches = () => lookupTargets(push.dir ?? cwd);
    // The first word is the remote. With no refspec git pushes the current
    // branch, to its own name or to its upstream.
    const named = remoteNamed ? refs : refs.slice(1);
    const refspecs = named.length > 0 ? named : [undefined];
    for (const refspec of refspecs) {
      const hit = findBlockedRefspec(refspec, currentBranches);
      if (hit) return hit;
    }
    const rerouted = push.configs.find((key) => REROUTING_CONFIG.test(key));
    if (rerouted !== undefined) {
      return `git -c ${rerouted} push (it changes where the push goes)`;
    }
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
    if (area === "pr" && gh[1] === "edit") {
      const base = prEditBase(gh);
      if (base !== undefined && base !== "dev") {
        return `gh pr edit --base ${base} (agents retarget PRs only to dev)`;
      }
    }
    const restMerge =
      area === "api" ? findBlockedRestMerge(gh, whole, lookups) : undefined;
    if (restMerge) {
      if (restMerge.hit) return restMerge.hit;
      lookups.allowedRestMerges.count++;
      continue;
    }
    if (area === "api") {
      // Any mention of "merge" in a request, with percent-escapes decoded, or
      // a GraphQL query the hook cannot read (a mutation, or one read from a
      // file), could be a merge that skips the dev-only rule.
      const request = decodeEscapes(gh.join(" "));
      if (
        API_MERGE_KEYWORDS.test(request) ||
        (gh.includes("graphql") &&
          (API_OPAQUE_QUERY.test(decodeEscapes(whole.join(" "))) ||
            gh.includes("--input")))
      ) {
        return "gh api merge (GraphQL mutation, branch merge or REST merge skips the dev-only rule)";
      }
      const write = findBlockedApiWrite(gh);
      if (write) return write;
    }
    const mergeArguments = prMergeArguments(gh);
    if (mergeArguments) {
      const hit = findBlockedPrMerge(mergeArguments, whole, lookups);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** The branch `gh pr edit --base` retargets to, if it does. */
function prEditBase(gh) {
  for (let index = 2; index < gh.length; index++) {
    const word = gh[index];
    if (word === "--base" || word === "-B") return gh[index + 1] ?? "";
    if (word.startsWith("--base=")) return word.slice(7);
    if (word.startsWith("-B") && word.length > 2) return word.slice(2);
  }
  return undefined;
}

/**
 * The git and gh commands a command runs, and whether one of them merges. A
 * merge must be the only git or gh command in its command line, so nothing
 * before it can change the PR it checks and nothing after it rides on it.
 */
function findChainedMerge(rawSegments) {
  let commands = 0;
  let merges = 0;
  for (const raw of rawSegments) {
    for (const subcommand of raw.replace(/\\\n/g, "").split(SUBCOMMAND_SPLIT)) {
      const words = shellWords(subcommand);
      const gh = ghArguments(words);
      if (gh) {
        commands++;
        const rest = gh.slice(1).map(decodeEscapes);
        if (
          prMergeArguments(gh) ||
          (gh[0] === "api" && rest.some((word) => REST_MERGE_PATH.test(word)))
        ) {
          merges++;
        }
      } else if (ghArguments(words, GIT_COMMAND)) {
        commands++;
      }
    }
  }
  return merges > 0 && commands > 1
    ? "gh pr merge chained with another git or gh command (run the merge on its own)"
    : undefined;
}

/**
 * An interpreter's inline script, `find -exec`, `xargs` and the like that
 * carry a git push, a git config write or a gh command: the hook cannot read
 * what they run, so it refuses them.
 */
function findOpaqueRunner(stripped, raw) {
  return OPAQUE_RUNNER.test(stripped) && MENTIONS_PUSH_OR_GH.test(raw)
    ? "a git push or gh command run through an inline script, find -exec or xargs (the hook cannot read it; run the command directly)"
    : undefined;
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
  {
    lookupBase,
    lookupFiles = lookupMergeFiles,
    lookupBody,
    lookupHead,
    lookupTargets = lookupPushTargets,
    cwd,
  } = {}
) {
  // Base, head and body come from one request unless a caller supplies them.
  const pulls = new Map();
  const pull = (args) => {
    const key = args.join(" ");
    if (!pulls.has(key)) pulls.set(key, lookupPull(args));
    return pulls.get(key);
  };
  const lookups = {
    lookupBase: lookupBase ?? ((args) => pull(args)?.base ?? null),
    lookupHead: lookupHead ?? ((args) => pull(args)?.head ?? null),
    lookupBody: lookupBody ?? ((args) => pull(args)?.body ?? null),
    lookupFiles,
    allowedRestMerges: { count: 0 },
  };
  const allowedRestMerges = lookups.allowedRestMerges;
  const rawSegments = executedSegments(command, 0, false);
  const strippedSegments = executedSegments(command);
  const chained = findChainedMerge(rawSegments);
  if (chained) return chained;
  for (const [index, raw] of rawSegments.entries()) {
    const hit =
      findOpaqueRunner(strippedSegments[index] ?? "", raw) ??
      findBlockedGitConfig(raw) ??
      findBlockedGh(raw, lookups) ??
      findBlockedPush(raw, { lookupTargets, cwd });
    if (hit) return hit;
  }
  let restMerges = 0;
  for (const segment of strippedSegments) {
    restMerges += segment.match(REST_MERGE_ROUTE)?.length ?? 0;
    if (restMerges > allowedRestMerges.count) return REST_MERGE_ROUTE;
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
    let cwd;
    try {
      const input = JSON.parse(data);
      const raw = input?.tool_input?.command ?? "";
      // Codex may send the command as an argument list.
      command = Array.isArray(raw) ? raw.join(" ") : String(raw);
      cwd = typeof input?.cwd === "string" ? input.cwd : undefined;
    } catch {
      // Input the hook cannot read is refused, not waved through.
      process.stderr.write(
        "BLOCKED: block-dangerous-git.mjs could not read the tool input, so the command was not checked.\n"
      );
      process.exit(2);
    }
    const hit = findBlockedPattern(command, { cwd });
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
