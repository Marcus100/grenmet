#!/usr/bin/env node
// Defense-in-depth, not a gate: appends every Bash command to a local,
// gitignored log. block-dangerous-git.mjs is regex-based best-effort (see
// its own comments) — a genuinely determined attempt to route around it
// (an alias, a wrapper script, unusual quoting) isn't guaranteed to be
// caught. This doesn't stop that; it means there's a record afterward, for
// both tools, in one place.

import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const logPath = join(repoRoot, ".agents-bash-audit.log");

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
    const line = `${new Date().toISOString()}\t${command.replaceAll("\n", "\\n")}\n`;
    try {
      appendFileSync(logPath, line);
    } catch {
      // Never block or error the turn over a logging failure.
    }
  }
  process.exit(0);
});
