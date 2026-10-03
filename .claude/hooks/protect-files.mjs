#!/usr/bin/env node
// Mechanically enforces the Never tier in AGENTS.md: never write to
// .env*/.env.local, never hand-edit the generated API client. Shared between
// Claude Code (.claude/settings.json) and Codex (.codex/config.toml).
//
// Fires two ways: on a structured file-edit tool call (Claude Code's
// Write/Edit/MultiEdit, Codex's apply_patch — tool_input.file_path), and on
// a Bash command that writes to a protected path via shell redirection
// (tool_input.command) — `echo x > .env`, `... >> .env`, `tee .env`. Found
// live: a raw `echo "test" > .env.test-hook` through the Bash tool bypassed
// the file_path check entirely, because it's a Bash call, not a file-edit
// tool call — apply_patch/Write/Edit never even saw it. Best-effort on the
// Bash path (same caveat as block-dangerous-git.mjs's DANGEROUS_PATTERNS):
// this catches the common redirect forms, not every way a shell can write a
// file (a script file, `cp`/`sed -i` with a computed destination, etc.).

import { stripQuotedLiterals } from "./block-dangerous-git.mjs";

const GENERATED_CLIENT_MARKER = "packages/api-client/src/gen/";

export function findProtectedViolation(filePath) {
  const normalized = filePath.replaceAll("\\", "/");

  // .env*.example / .env.local.example are committed templates (see
  // .gitignore) and are fine to edit — only real, git-ignored env files are
  // Never-tier. Note: this must NOT match ordinary `env.ts`/`env.md` files
  // (e.g. apps/web/auth/src/env.ts, which AGENTS.md itself tells agents to
  // edit regularly) — only a literal ".env" substring, not any "env".
  if (normalized.includes(".env") && !normalized.endsWith(".example")) {
    return {
      pattern: ".env*",
      message: `BLOCKED: '${filePath}' matches protected pattern '.env*' — see the Never tier in AGENTS.md. Ask the user to edit env files directly.`,
    };
  }

  if (normalized.includes(GENERATED_CLIENT_MARKER)) {
    return {
      pattern: GENERATED_CLIENT_MARKER,
      message: `BLOCKED: '${filePath}' is under packages/api-client/src/gen/ — see the Never tier in AGENTS.md. Regenerate via 'pnpm generate:api-client' instead of hand-editing.`,
    };
  }

  return null;
}

const REDIRECT_TARGET = />>?\s*([^\s;|&]+)/g;
const TEE_TARGET = /\btee\s+(?:-a\s+)?([^\s;|&]+)/g;

/**
 * Scan a Bash command for shell-redirection writes to a protected path.
 * Quote-stripped first (see block-dangerous-git.mjs) so `grep '> .env'`
 * doesn't false-positive on a search pattern that merely mentions the syntax.
 */
export function findShellWriteViolation(command) {
  const searchTarget = stripQuotedLiterals(command);
  const targets = [
    ...[...searchTarget.matchAll(REDIRECT_TARGET)].map((m) => m[1]),
    ...[...searchTarget.matchAll(TEE_TARGET)].map((m) => m[1]),
  ];
  for (const target of targets) {
    const violation = findProtectedViolation(target);
    if (violation) {
      return violation;
    }
  }
  return null;
}

// Codex sends apply_patch text in tool_input.command, not file_path.
export function findPatchWriteViolation(patch) {
  for (const line of patch.split(/\r?\n/)) {
    const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
    if (!match) continue;
    const violation = findProtectedViolation(match[1]);
    if (violation) return violation;
  }
  return null;
}

/* c8 ignore start -- exercised via scripts/guardrails/agent-hook-behavior.test.mjs, not by running this file directly */
if (import.meta.url === `file://${process.argv[1]}`) {
  let data = "";
  process.stdin.on("data", (chunk) => {
    data += chunk;
  });
  process.stdin.on("end", () => {
    let filePath = "";
    let command = "";
    let toolName = "";
    try {
      const parsed = JSON.parse(data);
      toolName = parsed?.tool_name ?? "";
      filePath = parsed?.tool_input?.file_path ?? "";
      command = parsed?.tool_input?.command ?? "";
    } catch {
      process.exit(0);
    }
    const violation = filePath
      ? findProtectedViolation(filePath)
      : toolName === "apply_patch"
        ? findPatchWriteViolation(command)
        : command
          ? findShellWriteViolation(command)
          : null;
    if (violation) {
      process.stderr.write(`${violation.message}\n`);
      process.exit(2);
    }
    process.exit(0);
  });
}
/* c8 ignore stop */
