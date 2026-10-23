// Runs a Codex review of the current branch and prints the findings, so the
// owner no longer relays the handoff block by hand. It reuses the block from
// review-handoff.mjs (head SHA, base SHA, changed files, receipt), so the
// reviewer examines exactly the commits the author names.
//
// Isolation, in the order it matters:
// - Codex runs in a detached checkout of the head SHA, so it reads the
//   committed bytes and never uncommitted edits.
// - The sandbox is read-only and the session ephemeral: no shell writes, no
//   commits, no pushes, no SESSION_LOG.md. Read-only still lets the shell read
//   the whole disk and does not limit MCP tools, so user config (which loads
//   the private Bishop and Playwright MCP servers) is ignored too.
// - Nothing is posted unless --post <pr> is given, and then only when the head
//   is pushed and the findings pass the repo's private-content check.
//
// Opt-in per PR because it spends Codex tokens.
//
//   pnpm agents:codex-review -- --task "..." --criteria "..."
//   pnpm agents:codex-review -- --base origin/dev --post 551
//   pnpm agents:codex-review -- --dry-run     # print the command and prompt

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecrets } from "../../.claude/hooks/audit-log.mjs";
import { findPrivateContent } from "../guardrails/check-private-content.mjs";
import { DEFAULT_BASE } from "../verification/receipt.mjs";
import { collect, render } from "./review-handoff.mjs";

const COMMENT_HEADER = "Codex read-only review (fresh context)";

const PUSHED_LINE = /^Pushed: .*$/m;
const TREE_LINE = /^Working tree: .*$/m;
// findPrivateContent tests vault paths against a file path only, so a vault or
// home path quoted inside the findings text needs its own check here.
const VAULT_REFERENCE =
  /(?:\/home\/[^/\s]+\/|~\/)(?:bishop|\.claude|\.codex|backups|grenmet-cleanup-archives)\b|\b(?:wiki|raw)\/(?:0[0-9]|9[89])-[a-z]|\/private\//;
// Shapes the shared redactor does not cover (this repo uses Stripe keys).
const EXTRA_SECRET_SHAPE =
  /sk_(?:live|test)_[A-Za-z0-9]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const PR_NUMBER = /^\d+$/;

/**
 * Detached checkout of exactly `head`, so the reviewer reads the committed
 * bytes the handoff names and never uncommitted edits made after it. Callers
 * must call `release()`.
 */
export function pinHead(root, head, spawn = spawnSync) {
  const dir = mkdtempSync(join(tmpdir(), "codex-pin-"));
  const add = spawn("git", ["worktree", "add", "--detach", dir, head], {
    cwd: root,
    encoding: "utf8",
  });
  if (add.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`git worktree add failed: ${add.stderr}`);
  }
  let released = false;
  return {
    dir,
    // Idempotent, and each step runs even if an earlier one throws, so a
    // failed cleanup cannot be repeated by a finally block or mask the first
    // error.
    release() {
      if (released) {
        return;
      }
      released = true;
      try {
        spawn("git", ["worktree", "remove", "--force", dir], { cwd: root });
      } finally {
        try {
          rmSync(dir, { recursive: true, force: true });
        } finally {
          spawn("git", ["worktree", "prune"], { cwd: root });
        }
      }
    },
  };
}

/**
 * Fills the author's fields into the handoff block. The block was written for
 * a remote reviewer, so the push and working-tree lines are restated for this
 * local, pinned run. Replacements are functions so `$&`, `` $` `` and `$'` in
 * the author's text are copied, not expanded.
 */
export function buildPrompt(info, { task, criteria, limitations }) {
  const fields = {
    "Task: <fill in>": `Task: ${task ?? "(not given; infer from the diff)"}`,
    "Acceptance criteria: <fill in>": `Acceptance criteria: ${criteria ?? "(not given)"}`,
    "Known limitations: <fill in>": `Known limitations: ${limitations ?? "none stated"}`,
  };
  let prompt = render(info)
    .replace(
      PUSHED_LINE,
      () => "Pushed: not required (local review of the committed head)"
    )
    .replace(
      TREE_LINE,
      () =>
        "Working tree: detached checkout of the head SHA; uncommitted changes are excluded"
    );
  // Template lines first, from the rendered block, so author text that quotes
  // a placeholder cannot be hit by a later replacement.
  const lines = prompt
    .split("\n")
    .map((line) => (Object.hasOwn(fields, line) ? fields[line] : line));
  prompt = lines.join("\n");
  return prompt.concat(
    `\nInspect only this head against the base with \`git diff ${info.mergeBase}..${info.head}\`. Follow AGENTS.md and the nested AGENTS.md of each changed directory.\n`
  );
}

/**
 * The codex invocation. The sandbox is fixed to read-only, the session is
 * ephemeral and user config (MCP servers) is ignored; the prompt arrives on
 * stdin so a long file list cannot overflow the argument limit.
 */
export function buildArgs(root, outFile) {
  return [
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--ignore-user-config",
    "--cd",
    root,
    "--output-last-message",
    outFile,
    "-",
  ];
}

/** Reasons the findings must not be posted to a public PR; empty when clean. */
export function postBlockers(findings, info) {
  const blockers = [];
  if (info.pushed !== true) {
    blockers.push(
      "the branch is not pushed at this head, so the comment would name a SHA the PR does not have"
    );
  }
  for (const finding of findPrivateContent([
    { path: "codex-findings.md", content: findings },
  ])) {
    blockers.push(finding);
  }
  if (VAULT_REFERENCE.test(findings)) {
    blockers.push(
      "the findings reference a private vault, home or /private/ path"
    );
  }
  // Same redactor the Bash audit log uses, so there is one list of secret shapes.
  if (
    redactSecrets(findings) !== findings ||
    EXTRA_SECRET_SHAPE.test(findings)
  ) {
    blockers.push("the findings contain a secret-shaped string");
  }
  return blockers;
}

/** Value of `--name <value>`; throws when the value is missing or a flag. */
export function flag(args, name) {
  const at = args.indexOf(name);
  if (at === -1) {
    return;
  }
  const value = args[at + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${name} needs a value`);
  }
  if (name === "--post" && !PR_NUMBER.test(value)) {
    throw new Error("--post needs a PR number");
  }
  return value;
}

function gitOut(spawn, root, args) {
  const result = spawn("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Comments the findings on `pr` after every gate passes; returns an exit code. */
function postFindings({ findings, info, pr, root, spawn }) {
  const blockers = postBlockers(findings, info);
  if (blockers.length > 0) {
    console.error(
      `Not posted to PR ${pr}:\n${blockers.map((b) => `  - ${b}`).join("\n")}`
    );
    return 1;
  }
  // A pushed branch does not prove this PR is that branch: a mistyped number
  // would put the review on an unrelated public PR.
  const view = spawn(
    "gh",
    ["pr", "view", pr, "--json", "headRefOid", "--jq", ".headRefOid"],
    { cwd: root, encoding: "utf8" }
  );
  const prHead = view.status === 0 ? String(view.stdout).trim() : null;
  if (prHead !== info.head) {
    console.error(
      `Not posted to PR ${pr}: its head is ${prHead ?? "unknown"}, not ${info.head}.`
    );
    return 1;
  }
  const body = `**${COMMENT_HEADER}** at \`${info.head}\` (base \`${info.mergeBase}\`)\n\n${findings}`;
  const post = spawn("gh", ["pr", "comment", pr, "--body-file", "-"], {
    cwd: root,
    encoding: "utf8",
    input: body,
  });
  if (post.status !== 0) {
    console.error(post.stderr);
    return post.status ?? 1;
  }
  return 0;
}

/**
 * The whole command. `deps` lets tests replace process spawning and the
 * handoff collector; the defaults are the real ones.
 */
export function run(args, deps = {}) {
  const spawn = deps.spawn ?? spawnSync;
  const gather = deps.collect ?? collect;
  const root = gitOut(spawn, process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (!root) {
    console.error("Not inside a git repository.");
    return 1;
  }
  let options;
  try {
    options = {
      base: flag(args, "--base") ?? DEFAULT_BASE,
      criteria: flag(args, "--criteria"),
      limitations: flag(args, "--limitations"),
      pr: flag(args, "--post"),
      task: flag(args, "--task"),
    };
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const info = gather(root, options.base);
  if (info.mergeBase === null || info.files.length === 0) {
    console.error("Nothing to review: no commits beyond the base.");
    return 1;
  }
  if (info.dirtyCount > 0) {
    console.error(
      `Warning: ${info.dirtyCount} uncommitted change(s); the review covers the committed head only.`
    );
  }
  const prompt = buildPrompt(info, options);
  if (args.includes("--dry-run")) {
    const preview = buildArgs(
      `<detached checkout of ${info.head}>`,
      "<findings file>"
    );
    console.log(`codex ${preview.join(" ")}\n\n${prompt}`);
    return 0;
  }

  const dir = mkdtempSync(join(tmpdir(), "codex-review-"));
  const outFile = join(dir, "findings.md");
  // spawnSync blocks the event loop, so without a handler Ctrl-C would kill
  // node before the finally blocks run and leak the worktree. With one, only
  // codex dies, spawnSync returns and cleanup runs.
  const ignoreSigint = () => undefined;
  process.on("SIGINT", ignoreSigint);
  let pin;
  try {
    pin = pinHead(root, info.head, spawn);
    const codex = spawn("codex", buildArgs(pin.dir, outFile), {
      cwd: pin.dir,
      encoding: "utf8",
      input: prompt,
      stdio: ["pipe", "inherit", "inherit"],
    });
    pin.release();
    pin = undefined;
    if (codex.status !== 0) {
      console.error(
        codex.error
          ? `could not run codex: ${codex.error.message}`
          : "codex exited with an error; no findings were produced."
      );
      return codex.status ?? 1;
    }
    if (!existsSync(outFile)) {
      console.error("codex exited 0 but wrote no findings.");
      return 1;
    }
    const findings = readFileSync(outFile, "utf8").trim();
    console.log(findings);
    return options.pr
      ? postFindings({ findings, info, pr: options.pr, root, spawn })
      : 0;
  } finally {
    pin?.release();
    rmSync(dir, { recursive: true, force: true });
    process.off("SIGINT", ignoreSigint);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
