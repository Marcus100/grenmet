#!/usr/bin/env node
// Stop gate shared by Claude Code and Codex: an agent may not end its turn
// with changes that `pnpm verify:changed` has not passed, unless it says why.
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
import { hookCheckoutRoot } from "./main-checkout.mjs";

export const STOP_REASON =
  "Changes since origin/dev have not passed `pnpm verify:changed` in their current state. " +
  "Run it (`--dry-run` lists the gates) and report the result before finishing. " +
  "If you are deliberately stopping first (a question for the user, review-only work, " +
  "work in progress), say so in one line and stop again.";

/**
 * "allow" when nothing changed, the changes are verified, or this state was
 * already flagged once; otherwise "block" (and remember the state).
 */
export function decideStop(root, { stopHookActive = false } = {}) {
  const files = changedFiles(root);
  if (!files || files.length === 0) return "allow";
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
      const decision = decideStop(hookCheckoutRoot, {
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
