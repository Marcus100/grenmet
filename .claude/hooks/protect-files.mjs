#!/usr/bin/env node
// Mechanically enforces the Never tier in AGENTS.md: never write to
// .env*/.env.local, never hand-edit the generated API client. Also raises a
// permission prompt for the Ask-first tier (toolchain config, new deps). Shared between
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

import { readFileSync } from "node:fs";

import { stripQuotedLiterals } from "./block-dangerous-git.mjs";

const GENERATED_CLIENT_MARKER = "packages/api-client/src/gen/";

// Committed, non-secret deploy config whose names happen to contain ".env"
// (their headers say secrets never go in them). Owner decision 2026-10-18:
// agents may edit these; real git-ignored env files stay blocked.
const COMMITTED_DEPLOY_CONFIG = /(?:^|\/)infra\/docker\/(?:staging|production)\.env$/;

export function findProtectedViolation(filePath) {
  const normalized = filePath.replaceAll("\\", "/");

  // .env*.example / .env.local.example are committed templates (see
  // .gitignore) and are fine to edit — only real, git-ignored env files are
  // Never-tier. Note: this must NOT match ordinary `env.ts`/`env.md` files
  // (e.g. apps/web/auth/src/env.ts, which AGENTS.md itself tells agents to
  // edit regularly) — only a literal ".env" substring, not any "env".
  if (
    normalized.includes(".env") &&
    !normalized.endsWith(".example") &&
    !COMMITTED_DEPLOY_CONFIG.test(normalized)
  ) {
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

// Ask-first tier in AGENTS.md: shared toolchain config and new dependencies need
// the user's go-ahead, not a hard block (the user may already have authorized
// it). Claude Code turns these into a permission prompt; Codex has no "ask"
// hook decision, so there the text rule stands alone.
const ASK_FIRST_CONFIG =
  /(?:^|\/)(?:turbo\.json|biome\.jsonc|tsconfig[^/]*\.json)$/;
const DEPENDENCY_MANIFEST = /(?:^|\/)(?:package\.json|pyproject\.toml)$/;
// A package.json dependency pinned to a registry version, not catalog:/workspace:.
const NPM_VERSIONED_DEP =
  /"(@?[\w.-]+(?:\/[\w.-]+)?)"\s*:\s*"(?:npm:|[\^~>=<]|\d)[^"]*"/g;
const NPM_NON_DEP_KEYS = new Set(["version", "node", "pnpm", "packageManager"]);
// A PEP 508 requirement string such as "httpx>=0.27".
const PY_REQUIREMENT = /"([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*[<>=~!]=?/g;

function newDependencyNames(filePath, text) {
  if (!text) return [];
  const pattern = filePath.endsWith("pyproject.toml")
    ? PY_REQUIREMENT
    : NPM_VERSIONED_DEP;
  return [...text.matchAll(pattern)]
    .map((m) => m[1])
    .filter((name) => !NPM_NON_DEP_KEYS.has(name));
}

/**
 * Ask-first check for a structured edit. `addedText` is the text the edit
 * introduces (Edit new_string, MultiEdit new_strings, Write content) and
 * `removedText` what it replaces, so re-writing an existing dependency line
 * does not prompt.
 */
export function findAskFirstEdit(filePath, addedText = "", removedText = "") {
  const normalized = filePath.replaceAll("\\", "/");
  if (ASK_FIRST_CONFIG.test(normalized)) {
    return `'${filePath}' is shared toolchain config — AGENTS.md "Ask first" tier. Confirm the user authorized this edit.`;
  }
  if (DEPENDENCY_MANIFEST.test(normalized)) {
    const existing = new Set(newDependencyNames(normalized, removedText));
    const added = newDependencyNames(normalized, addedText).filter(
      (name) => !existing.has(name)
    );
    if (added.length > 0) {
      const hint = normalized.endsWith("pyproject.toml")
        ? "any new Python dependency"
        : "npm dependencies outside the catalog — prefer catalog:";
      return `'${filePath}' gains dependencies (${added.join(", ")}) — AGENTS.md "Ask first" tier covers ${hint}. Confirm the user approved them.`;
    }
  }
  return null;
}

function editTexts(toolName, input, filePath) {
  if (toolName === "Write") {
    let current = "";
    try {
      current = readFileSync(filePath, "utf8");
    } catch {
      current = "";
    }
    return [input?.content ?? "", current];
  }
  if (toolName === "MultiEdit") {
    const edits = input?.edits ?? [];
    return [
      edits.map((e) => e?.new_string ?? "").join("\n"),
      edits.map((e) => e?.old_string ?? "").join("\n"),
    ];
  }
  return [input?.new_string ?? "", input?.old_string ?? ""];
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
    let toolInput = {};
    try {
      const parsed = JSON.parse(data);
      toolInput = parsed?.tool_input ?? {};
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
    if (filePath && ["Write", "Edit", "MultiEdit"].includes(toolName)) {
      const reason = findAskFirstEdit(
        filePath,
        ...editTexts(toolName, toolInput, filePath)
      );
      if (reason) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "ask",
              permissionDecisionReason: reason,
            },
          })
        );
      }
    }
    process.exit(0);
  });
}
/* c8 ignore stop */
