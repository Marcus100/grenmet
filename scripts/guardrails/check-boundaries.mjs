#!/usr/bin/env node
// Import-direction rules for apps and shared packages. Each rule restates a
// rule from AGENTS.md or an ADR so it is enforced, not just written down.
//
//   node scripts/guardrails/check-boundaries.mjs   # exits 1 on any violation
//
// Scans TypeScript/JavaScript sources for static imports, re-exports, dynamic
// import() and require(). Generated and vendored directories are skipped.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
// Skipped at any depth.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "coverage",
  "playwright-report",
  "test-results",
]);
// Build output directly inside a workspace, and the generated API client.
const SKIP_WORKSPACE_DIRS = new Set(["dist", "build"]);
const GENERATED = "packages/api-client/src/gen";
// from "x" | import "x" | import("x") | require("x")
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;
const DATABASE_CLIENT =
  /^(?:pg|pg-pool|postgres|mysql2?|kysely|ioredis|redis|@prisma\/client|drizzle-orm(?:\/.*)?|@vercel\/postgres|@neondatabase\/serverless)$/;
const ROUTE_HANDLER = /(?:^|\/)route\.[cm]?[jt]sx?$/;

function posix(root, path) {
  return relative(root, path).split(sep).join("/");
}

/** The workspace an absolute path belongs to: "apps/web/gms", "packages/ui", or null. */
function workspaceOf(root, file) {
  const parts = relative(root, file).split(sep);
  if (parts[0] === "apps" && parts[1] === "web" && parts[2])
    return parts.slice(0, 3).join("/");
  if (parts[0] === "packages" && parts[1]) return parts.slice(0, 2).join("/");
  return null;
}

function isOwnPackage(specifier, own) {
  return specifier === own || specifier.startsWith(`${own}/`);
}

// Blanks out comments but keeps newlines, so match offsets map to line numbers.
// `//` preceded by `:` is left alone so URLs in strings survive.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, before) => before);
}

export const rules = [
  {
    id: "package-imports-app",
    why: "Shared packages must not depend on an app (dependencies point from apps to packages).",
    test: ({ from, specifier, target }) =>
      from.startsWith("packages/") &&
      (specifier.startsWith("@barrelsgd/web-") || target?.startsWith("apps/")),
  },
  {
    id: "app-imports-other-app",
    why: "Apps are deployed separately; share code through a package, not another app's source.",
    test: ({ from, specifier, target }) =>
      from.startsWith("apps/web/") &&
      ((specifier.startsWith("@barrelsgd/web-") &&
        // An app's own package name is allowed (rare, but not a boundary leak).
        !isOwnPackage(specifier, `@barrelsgd/web-${from.split("/")[2]}`)) ||
        (target?.startsWith("apps/") === true && target !== from)),
  },
  {
    id: "package-imports-sentry",
    why: "AGENTS.md: never import @sentry/* in a shared package; apps wire reportError.",
    test: ({ from, specifier }) =>
      from.startsWith("packages/") && specifier.startsWith("@sentry/"),
  },
  {
    id: "ui-imports-brand",
    why: "ADR-0011: shared UI carries no brand; @barrelsgd/ui must not import @barrelsgd/gms.",
    test: ({ from, specifier, target }) =>
      from === "packages/ui" &&
      (specifier === "@barrelsgd/gms" ||
        specifier.startsWith("@barrelsgd/gms/") ||
        target === "packages/gms"),
  },
  {
    id: "route-handler-database",
    why: "AGENTS.md: Next.js route handlers only validate, proxy to FastAPI or render; Payload CMS is the one TypeScript backend.",
    test: ({ from, file, specifier }) =>
      from.startsWith("apps/web/") &&
      from !== "apps/web/cms" &&
      ROUTE_HANDLER.test(file) &&
      DATABASE_CLIENT.test(specifier),
  },
];

function* sourceFiles(root, directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const skip =
        SKIP_DIRS.has(entry.name) ||
        entry.name.startsWith(".") ||
        (SKIP_WORKSPACE_DIRS.has(entry.name) &&
          posix(root, directory) === workspaceOf(root, directory)) ||
        posix(root, path) === GENERATED;
      if (!skip) yield* sourceFiles(root, path);
    } else if (SOURCE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield path;
    }
  }
}

/** Every source file under apps/web and packages, in scan order. */
function* scannedFiles(root) {
  for (const base of [join(root, "apps", "web"), join(root, "packages")])
    yield* sourceFiles(root, base);
}

/**
 * Each import specifier in one file: its 1-based line and, for relative
 * specifiers, the workspace it resolves into.
 */
function* importsIn(root, path) {
  const code = stripComments(readFileSync(path, "utf8"));
  for (const match of code.matchAll(SPECIFIER)) {
    const specifier = match[1];
    yield {
      specifier,
      line: code.slice(0, match.index).split("\n").length,
      target: specifier.startsWith(".")
        ? workspaceOf(root, resolve(dirname(path), specifier))
        : null,
    };
  }
}

/** Rules that one import breaks, as reportable violation records. */
function violationsForImport(context) {
  return rules
    .filter((rule) => rule.test(context))
    .map((rule) => ({
      file: context.file,
      line: context.line,
      specifier: context.specifier,
      rule: rule.id,
      why: rule.why,
    }));
}

/** Returns violations as { file, line, specifier, rule, why }. */
export function findViolations(root) {
  const violations = [];
  for (const path of scannedFiles(root)) {
    const from = workspaceOf(root, path);
    if (!from) continue;
    const file = posix(root, path);
    for (const imported of importsIn(root, path))
      violations.push(...violationsForImport({ from, file, ...imported }));
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const violations = findViolations(root);
  for (const v of violations)
    console.error(
      `${v.file}:${v.line} imports "${v.specifier}" [${v.rule}]\n  ${v.why}`
    );
  if (violations.length > 0) {
    console.error(`\n${violations.length} import boundary violation(s).`);
    process.exit(1);
  }
  console.log("Import boundaries passed.");
}
