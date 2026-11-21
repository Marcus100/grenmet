#!/usr/bin/env node
// Codex PreToolUse(Bash) hook: heavy commands (tests, builds, installs,
// type-checks, pushes and commits that run hooks) must go through
// ~/.local/bin/heavy, which takes a slot and runs inside the memory-capped
// agents.slice. Claude rewrites the command automatically
// (~/.claude/hooks/auto-heavy.mjs); this hook refuses the bare command with the
// exact command to run instead, so Codex retries it the safe way.
// Same pattern list as auto-heavy.mjs; keep the two in step.
import { readFileSync } from "node:fs";

let command = "";
try {
  command = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}
if (Array.isArray(command)) {
  command = command.join(" ");
}
const HEAVY =
  /(^|[\s;&|(])(pnpm\s+(verify|test|build|type-?check|fix|install|i|e2e|lint|generate|check|exec\s+(vitest|tsc|playwright|turbo|ultracite))|npm\s+(test|run\s+build|ci|install)|npx\s+(vitest|tsc|playwright|turbo)|turbo\s+run|vitest|pytest|uv\s+(run|sync)|tsc(\s|$)|next\s+build|playwright\s+test|alembic|mypy|git\s+(push|commit))/u;
const ALREADY =
  /(^|[\s;&|(])(heavy|~\/\.local\/bin\/heavy|\$HOME\/\.local\/bin\/heavy|\/home\/\S+\/\.local\/bin\/heavy)\s/u;

if (!HEAVY.test(command) || ALREADY.test(command) || process.env.HEAVY_INSIDE) {
  process.exit(0);
}
const quoted = `'${command.replace(/'/gu, `'\\''`)}'`;
process.stderr.write(
  `Heavy command: run it through the shared memory guard instead:\n  $HOME/.local/bin/heavy bash -c ${quoted}\n(One heavy job at a time on this machine; see docs/agents/tool-usage.md.)\n`
);
process.exit(2);
