#!/usr/bin/env node

/**
 * Advisory PostToolUse hook: flags Refactoring UI violations that
 * `pnpm design-system:audit` cannot see.
 *
 * The audit catches off-system *values* (hard-coded colors, arbitrary spacing,
 * app-local shadows). This catches on-system values used in a way the book
 * calls out — weight below 400, transparent text on colour, em-based type,
 * grey on coloured backgrounds, untracked caps.
 *
 * Never blocks. Emits `additionalContext` and exits 0; a parse failure or an
 * unexpected payload exits 0 silently rather than interrupting the edit.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCANNED_EXTENSIONS = /\.(tsx|jsx|css|ts)$/;
const SCANNED_PATHS = /(apps\/web\/|packages\/(ui|gms)\/)/;
/** Generated, vendored and build output — same set the design-system audit skips. */
const EXCLUDED_PATHS =
  /(^|\/)(\.next|\.source|\.turbo|\.content-collections|build|coverage|dist|node_modules|out|public)(\/|$)/;

/** Checks run against each string literal — where Tailwind classes live. */
const CLASS_CHECKS = [
  {
    title: "font weight below 400",
    re: /\bfont-(?:thin|extralight|light)\b/,
    principle: "Size isn't everything",
    fix: "Weights under 400 are too hard to read at UI sizes. De-emphasise with a lighter colour (text-muted-foreground) or a smaller step on the type scale instead.",
  },
  {
    title: "transparent text colour",
    re: /\btext-(?:white|black)\/\d{1,3}\b/,
    principle: "Don't use grey text on coloured backgrounds",
    fix: "Semi-transparent white looks washed out or disabled, and lets patterns show through the letterforms. Use a hand-picked foreground token (text-primary-foreground, text-warning-soft-foreground) instead.",
  },
  {
    title: "em-based font size",
    re: /\btext-\[[\d.]+em\]/,
    principle: "Establish a type scale",
    fix: "em compounds when nested, so the computed size leaves the scale. Use a text-* step (text-body, text-heading-md) or a px/rem value.",
  },
  {
    title: "justified text without hyphenation",
    re: /\btext-justify\b/,
    guard: (s) => !/\bhyphens-(?:auto|manual)\b/.test(s),
    principle: "Align with readability in mind",
    fix: "Justification without hyphenation opens ragged word gaps. Add hyphens-auto, or left-align.",
  },
  {
    title: "grey text on a coloured background",
    // Co-occurrence check, so it needs the two classes to actually apply at the
    // same time: base classes only (no `hover:` / `selection:` variants), and no
    // interpolation or line breaks, which mean mutually exclusive ternary arms.
    scope: "base",
    re: /\bbg-(?:primary|destructive|accent|success|warning|info)\b(?!-)/,
    guard: (s) =>
      /\btext-(?:muted-foreground|gray-\d|slate-\d|neutral-\d|zinc-\d)/.test(s),
    principle: "Don't use grey text on coloured backgrounds",
    fix: "Grey works on white because it reduces contrast; on colour it just looks dirty. Move the text toward the background's own hue — the *-soft tier (bg-warning-soft / text-warning-soft-foreground) exists for this.",
  },
  {
    title: "all-caps without letter-spacing",
    re: /\buppercase\b/,
    guard: (s) => !/\btracking-/.test(s),
    principle: "Use letter-spacing effectively",
    fix: "Caps lack the ascenders and descenders that make lowercase legible, so default spacing reads as cramped. Add a tracking-* value.",
  },
  {
    title: "centred long-form text",
    re: /\btext-center\b/,
    guard: (s) => /\bprose\b/.test(s),
    principle: "Align with readability in mind",
    fix: "Centring works for headlines and short blocks; past two or three lines it hurts. Left-align, or shorten the copy.",
  },
];

/** Checks run against raw file text — CSS declarations. */
const SOURCE_CHECKS = [
  {
    title: "font weight below 400",
    re: /font-weight\s*:\s*(?:100|200|300)\b/,
    principle: "Size isn't everything",
    fix: "Weights under 400 are too hard to read at UI sizes. Use a lighter colour or a smaller size to de-emphasise.",
  },
  {
    title: "em-based font size",
    re: /font-size\s*:\s*[\d.]+em\b/,
    principle: "Establish a type scale",
    fix: "em compounds when nested, so the computed size leaves the scale. Use a --font-size-* token, or px/rem.",
  },
  {
    title: "shade generated on the fly",
    re: /\b(?:lighten|darken)\s*\(/,
    principle: "Define your shades up front",
    fix: "Generated shades are how a palette becomes 35 indistinguishable blues. Take an existing shade, or raise a token request.",
  },
];

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Extracts quoted and backtick string literals with their line numbers. */
function stringLiterals(text) {
  const found = [];
  const re = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;
  let m = re.exec(text);
  while (m !== null) {
    const value = m[1] ?? m[2] ?? m[3];
    if (value && value.length > 1) {
      found.push({ value, line: lineOf(text, m.index) });
    }
    m = re.exec(text);
  }
  return found;
}

/**
 * The unconditional, always-applied classes in a literal, for checks that need
 * two classes to be in effect simultaneously. Returns null when the literal
 * interpolates or wraps, since those carry branches that never co-occur.
 */
function baseClasses(value) {
  if (value.includes("${") || value.includes("\n")) {
    return null;
  }
  return value
    .split(/\s+/)
    .filter((token) => !token.includes(":"))
    .join(" ");
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
    }
  }
  return line;
}

export function collect(text) {
  const findings = new Map();

  const record = (check, line) => {
    const key = `${check.title}:${line}`;
    if (!findings.has(key)) {
      findings.set(key, { ...check, line });
    }
  };

  for (const { value, line } of stringLiterals(text)) {
    const base = baseClasses(value);
    for (const check of CLASS_CHECKS) {
      const subject = check.scope === "base" ? base : value;
      if (
        subject !== null &&
        check.re.test(subject) &&
        (!check.guard || check.guard(subject))
      ) {
        record(check, line);
      }
    }
  }

  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const check of SOURCE_CHECKS) {
      if (check.re.test(line)) {
        record(check, index + 1);
      }
    }
  }

  return [...findings.values()].sort((a, b) => a.line - b.line);
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const input = payload?.tool_input ?? {};
  const filePath = input.file_path;
  if (typeof filePath !== "string") {
    return;
  }
  if (
    !(SCANNED_EXTENSIONS.test(filePath) && SCANNED_PATHS.test(filePath)) ||
    EXCLUDED_PATHS.test(filePath)
  ) {
    return;
  }

  // Only what this edit introduced — never nag about pre-existing code.
  const written = [
    input.content,
    input.new_string,
    ...(Array.isArray(input.edits) ? input.edits.map((e) => e?.new_string) : []),
  ]
    .filter((value) => typeof value === "string")
    .join("\n");

  if (!written) {
    return;
  }

  const findings = collect(written);
  if (findings.length === 0) {
    return;
  }

  const body = findings
    .map(
      (f) =>
        `- **${f.title}** (line ~${f.line}) — *${f.principle}*\n  ${f.fix}`,
    )
    .join("\n");

  const context = [
    `Refactoring UI notes on ${filePath} (advisory — nothing was blocked):`,
    "",
    body,
    "",
    "Fix what applies and move on. If a case is deliberate, say so and continue — these are heuristics, not gates. Full principles: the `refactoring-ui` skill.",
  ].join("\n");

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: context,
      },
    })}\n`,
  );
}

// Only run the hook when executed directly, so `collect` stays importable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
