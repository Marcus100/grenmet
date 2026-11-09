#!/usr/bin/env node
// Stop gate shared by Claude Code and Codex: an agent may not end its turn
// with local changes that nothing has checked, unless it says why. Work that is
// committed and pushed passes: GitHub CI is the full gate for it (owner,
// 9 Nov 2026: fast targeted checks locally, heavy gates on GitHub), and nothing
// merges without green CI. Unpushed or uncommitted work still needs a passing
// `pnpm verify:changed` receipt or a one-line reason.
//
// Never mutates files (Codex's config forbids a mutating Stop hook, because
// another client may own dirty files) and never runs a check itself, which
// would add minutes to every turn. It compares the current changes with the
// receipt verify:changed writes (scripts/verification/receipt.mjs).
//
// It blocks at most once per state: the second stop for the same fingerprint
// passes, so an agent that is deliberately pausing (a question for the user,
// review-only work, work in progress) explains in one line and stops.

import {
  changedFiles,
  fingerprint,
  readReceipt,
  writeReceipt,
} from "../../scripts/verification/receipt.mjs";
import { spawnSync } from "node:child_process";
import { hookCheckoutRoot } from "./main-checkout.mjs";

export const STOP_REASON =
  "Changes since origin/dev are neither pushed for CI nor verified locally. " +
  "Commit and push them so GitHub CI checks them (run the targeted tests of what you " +
  "changed first), or run `pnpm verify:changed` and report the result. " +
  "If you are deliberately stopping first (a question for the user, review-only work, " +
  "work in progress), say so in one line and stop again.";

/**
 * The checkout the session is working in: the git top level of the hook
 * input's `cwd`, which can be a worktree other than the one the hooks were
 * loaded from. Falls back to the hooks' own checkout.
 */
export function sessionCheckout(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : null;
  if (!cwd) return hookCheckoutRoot;
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : hookCheckoutRoot;
}

/**
 * True when the working tree is clean and HEAD is on its upstream branch, so
 * GitHub CI checks exactly this state.
 */
export function pushedAndClean(root) {
  const run = (args) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const status = run(["status", "--porcelain"]);
  if (status.status !== 0 || status.stdout.trim() !== "") return false;
  const head = run(["rev-parse", "HEAD"]);
  const upstream = run(["rev-parse", "@{upstream}"]);
  return (
    head.status === 0 &&
    upstream.status === 0 &&
    head.stdout.trim() === upstream.stdout.trim()
  );
}

/**
 * "allow" when nothing changed, the work is pushed for CI, the changes are
 * verified locally, or this state was already flagged once; otherwise "block"
 * (and remember the state).
 */
export function decideStop(root, { stopHookActive = false } = {}) {
  const files = changedFiles(root);
  if (!files || files.length === 0) return "allow";
  if (pushedAndClean(root)) return "allow";
  const current = fingerprint(root, files);
  const receipt = readReceipt(root);
  if (receipt.verified === current) return "allow";
  if (stopHookActive || receipt.flagged === current) return "allow";
  writeReceipt(root, { flagged: current });
  return "block";
}

/* c8 ignore start -- exercised via scripts/guardrails/agent-hook-behavior.test.mjs, not by running this file directly */
if (import.meta.url === `file://${process.argv[1]}`) {
  let data = "";
  process.stdin.on("data", (chunk) => {
    data += chunk;
  });
  process.stdin.on("end", () => {
    let input = {};
    try {
      input = JSON.parse(data || "{}");
    } catch {
      process.exit(0);
    }
    try {
      const decision = decideStop(sessionCheckout(input), {
        stopHookActive: input?.stop_hook_active === true,
      });
      if (decision === "block") {
        process.stdout.write(
          JSON.stringify({ decision: "block", reason: STOP_REASON })
        );
      }
    } catch {
      // A broken gate must never trap the agent in its turn.
    }
    process.exit(0);
  });
}
/* c8 ignore stop */
