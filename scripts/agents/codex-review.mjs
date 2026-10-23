// Runs a read-only Codex review of the current branch and prints the findings,
// so the owner no longer relays the handoff block by hand. It reuses the block
// from review-handoff.mjs (head SHA, base SHA, changed files, receipt), so the
// reviewer examines exactly the commits the author names. Codex starts a fresh,
// ephemeral session in a read-only sandbox: it can run `git diff` and read
// files but cannot edit, commit, push or write SESSION_LOG.md, which is the
// review role in docs/agents/roles.md.
//
// Opt-in per PR because it spends Codex tokens. Nothing is posted unless
// --post <pr> is given.
//
//   pnpm agents:codex-review -- --task "..." --criteria "..."
//   pnpm agents:codex-review -- --base origin/dev --post 551
//   pnpm agents:codex-review -- --dry-run     # print the command and prompt

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BASE } from "../verification/receipt.mjs";
import { collect, render } from "./review-handoff.mjs";

const COMMENT_HEADER = "Codex read-only review (fresh context)";

const PUSHED_LINE = /^Pushed: .*$/m;
const TREE_LINE = /^Working tree: .*$/m;

/**
 * Detached checkout of exactly `head`, so the reviewer reads the committed
 * bytes the handoff names and never uncommitted edits made after it. Callers
 * must call `release()`.
 */
export function pinHead(root, head) {
  const dir = mkdtempSync(join(tmpdir(), "codex-pin-"));
  const add = spawnSync("git", ["worktree", "add", "--detach", dir, head], {
    cwd: root,
    encoding: "utf8",
  });
  if (add.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`git worktree add failed: ${add.stderr}`);
  }
  return {
    dir,
    release() {
      spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: root });
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Fills the author's fields into the handoff block. The block was written for
 * a remote reviewer, so the push and working-tree lines are restated for this
 * local, pinned run.
 */
export function buildPrompt(info, { task, criteria, limitations }) {
  return render(info)
    .replace(
      PUSHED_LINE,
      "Pushed: not required (local review of the committed head)"
    )
    .replace(
      TREE_LINE,
      "Working tree: detached checkout of the head SHA; uncommitted changes are excluded"
    )
    .replace(
      "Task: <fill in>",
      `Task: ${task ?? "(not given; infer from the diff)"}`
    )
    .replace(
      "Acceptance criteria: <fill in>",
      `Acceptance criteria: ${criteria ?? "(not given)"}`
    )
    .replace(
      "Known limitations: <fill in>",
      `Known limitations: ${limitations ?? "none stated"}`
    )
    .concat(
      `\nInspect only this head against the base with \`git diff ${info.mergeBase}..${info.head}\`. Follow AGENTS.md and the nested AGENTS.md of each changed directory.\n`
    );
}

/**
 * The codex invocation. The sandbox is fixed to read-only and the session is
 * ephemeral; the prompt arrives on stdin so a long file list cannot overflow
 * the argument limit.
 */
export function buildArgs(root, outFile) {
  return [
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--cd",
    root,
    "--output-last-message",
    outFile,
    "-",
  ];
}

function flag(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function main(args) {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (!root) {
    console.error("Not inside a git repository.");
    return 1;
  }
  const info = collect(root, flag(args, "--base") ?? DEFAULT_BASE);
  if (info.mergeBase === null || info.files.length === 0) {
    console.error("Nothing to review: no commits beyond the base.");
    return 1;
  }
  if (info.dirtyCount > 0) {
    console.error(
      `Warning: ${info.dirtyCount} uncommitted change(s); the review covers the committed head only.`
    );
  }
  const prompt = buildPrompt(info, {
    task: flag(args, "--task"),
    criteria: flag(args, "--criteria"),
    limitations: flag(args, "--limitations"),
  });
  const dir = mkdtempSync(join(tmpdir(), "codex-review-"));
  const outFile = join(dir, "findings.md");
  if (args.includes("--dry-run")) {
    console.log(
      `codex ${buildArgs(`<detached checkout of ${info.head}>`, outFile).join(" ")}\n\n${prompt}`
    );
    rmSync(dir, { recursive: true, force: true });
    return 0;
  }
  const pin = pinHead(root, info.head);
  let run;
  try {
    run = spawnSync("codex", buildArgs(pin.dir, outFile), {
      cwd: pin.dir,
      encoding: "utf8",
      input: prompt,
      stdio: ["pipe", "inherit", "inherit"],
    });
  } finally {
    pin.release();
  }
  if (run.status !== 0) {
    console.error("codex exited with an error; no findings were produced.");
    rmSync(dir, { recursive: true, force: true });
    return run.status ?? 1;
  }
  const findings = readFileSync(outFile, "utf8").trim();
  rmSync(dir, { recursive: true, force: true });
  console.log(findings);
  const pr = flag(args, "--post");
  if (pr) {
    const body = `**${COMMENT_HEADER}** at \`${info.head}\` (base \`${info.mergeBase}\`)\n\n${findings}`;
    const post = spawnSync("gh", ["pr", "comment", pr, "--body-file", "-"], {
      cwd: root,
      encoding: "utf8",
      input: body,
    });
    if (post.status !== 0) {
      console.error(post.stderr);
      return post.status ?? 1;
    }
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
