#!/usr/bin/env node
// Scoped auto-format after Edit/Write/MultiEdit — formats only the file that
// was just touched, matching how refactoring-ui-check.mjs already scopes
// itself (reads tool_input.file_path). An earlier version of this hook ran
// `pnpm dlx ultracite fix` with no file argument, which reformats the entire
// ~2500-file repo on every single edit — slow and needless.
//
// Files outside this checkout (an agent's scratchpad, /tmp) are left alone:
// formatting them rewrote artifacts the agent was still editing.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function isInsideRepo(filePath, root = repoRoot) {
  const fromRoot = relative(root, resolve(root, filePath));
  return (
    fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot)
  );
}

/* c8 ignore start -- exercised via scripts/guardrails/agent-hook-behavior.test.mjs, not by running this file directly */
if (import.meta.url === `file://${process.argv[1]}`) {
  let data = "";
  process.stdin.on("data", (chunk) => {
    data += chunk;
  });
  process.stdin.on("end", () => {
    let filePath = "";
    try {
      filePath = JSON.parse(data)?.tool_input?.file_path ?? "";
    } catch {
      process.exit(0);
    }
    if (!(filePath && isInsideRepo(filePath) && existsSync(filePath))) {
      process.exit(0);
    }
    // `pnpm exec`, not `pnpm dlx` — dlx doesn't respect this repo's pinned
    // ultracite version (package.json), so it can silently drift from what
    // `pnpm fix` and CI actually run.
    spawnSync("pnpm", ["exec", "ultracite", "fix", filePath], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    process.exit(0);
  });
}
/* c8 ignore stop */
