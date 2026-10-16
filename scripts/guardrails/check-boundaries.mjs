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
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "gen",
  "playwright-report",
  "test-results",
]);
// from "x" | import "x" | import("x") | require("x")
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;
const DATABASE_CLIENT =
  /^(?:pg|pg-pool|postgres|mysql2?|kysely|ioredis|redis|@prisma\/client|drizzle-orm(?:\/.*)?|@vercel\/postgres|@neondatabase\/serverless)$/;
const ROUTE_HANDLER = /(?:^|\/)route\.[cm]?[jt]sx?$/;

/** The workspace an absolute path belongs to: "apps/web/gms", "packages/ui", or null. */
function workspaceOf(root, file) {
  const parts = relative(root, file).split(sep);
  if (parts[0] === "apps" && parts[1] === "web" && parts[2])
    return parts.slice(0, 3).join("/");
  if (parts[0] === "packages" && parts[1]) return parts.slice(0, 2).join("/");
  return null;
}

export const rules = [
  {
    id: "package-imports-app",
    why: "Shared packages must not depend on an app (dependencies point from apps to packages).",
    test: ({ from, specifier, target }) =>
      from.startsWith("packages/") &&
      (specifier.startsWith("@barrelsgd/web-") ||
        target?.startsWith("apps/")),
  },
  {
    id: "app-imports-other-app",
    why: "Apps are deployed separately; share code through a package, not another app's source.",
    test: ({ from, specifier, target }) =>
      from.startsWith("apps/web/") &&
      ((specifier.startsWith("@barrelsgd/web-") &&
        // An app's own package name is allowed (rare, but not a boundary leak).
        specifier !== `@barrelsgd/web-${from.split("/")[2]}`) ||
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

function* sourceFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith("."))
        yield* sourceFiles(join(directory, entry.name));
    } else if (SOURCE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield join(directory, entry.name);
    }
  }
}

/** Returns violations as { file, line, specifier, rule, why }. */
export function findViolations(root) {
  const violations = [];
  for (const base of [join(root, "apps", "web"), join(root, "packages")]) {
    for (const path of sourceFiles(base)) {
      const from = workspaceOf(root, path);
      if (!from) continue;
      const file = relative(root, path).split(sep).join("/");
      const lines = readFileSync(path, "utf8").split("\n");
      lines.forEach((text, index) => {
        if (/^\s*(?:\/\/|\*)/.test(text)) return;
        for (const match of text.matchAll(SPECIFIER)) {
          const specifier = match[1];
          const target = specifier.startsWith(".")
            ? workspaceOf(root, resolve(dirname(path), specifier))
            : null;
          for (const rule of rules) {
            if (rule.test({ from, file, specifier, target }))
              violations.push({
                file,
                line: index + 1,
                specifier,
                rule: rule.id,
                why: rule.why,
              });
          }
        }
      });
    }
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
