import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findViolations } from "./check-boundaries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function tree(files) {
  const base = mkdtempSync(join(tmpdir(), "boundaries-"));
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(dirname(join(base, file)), { recursive: true });
    writeFileSync(join(base, file), source);
  }
  return base;
}

function rulesIn(files) {
  const base = tree(files);
  try {
    return findViolations(base).map(({ file, rule }) => `${file} ${rule}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("the repository has no import boundary violations", () => {
  const violations = findViolations(root);
  assert.deepEqual(
    violations.map((v) => `${v.file}:${v.line} ${v.specifier} [${v.rule}]`),
    []
  );
});

test("shared packages cannot import apps, Sentry or (for ui) a brand", () => {
  assert.deepEqual(
    rulesIn({
      "packages/ui/src/a.ts": [
        'import { x } from "@barrelsgd/web-gms";',
        'export * from "../../../apps/web/gms/src/lib/x";',
        'import "@sentry/nextjs";',
        'import { palette } from "@barrelsgd/gms/styles";',
      ].join("\n"),
      "packages/auth/src/b.ts": 'import { y } from "@barrelsgd/ui/lib/utils";',
    }),
    [
      "packages/ui/src/a.ts package-imports-app",
      "packages/ui/src/a.ts package-imports-app",
      "packages/ui/src/a.ts package-imports-sentry",
      "packages/ui/src/a.ts ui-imports-brand",
    ]
  );
});

test("apps cannot import another app's source", () => {
  assert.deepEqual(
    rulesIn({
      "apps/web/gms/src/a.ts": [
        'import { a } from "../../auth/src/lib/session";',
        'const b = await import("@barrelsgd/web-auth");',
        'import { c } from "./local";',
        'import { d } from "@barrelsgd/ui/components/ui/button";',
      ].join("\n"),
    }),
    [
      "apps/web/gms/src/a.ts app-imports-other-app",
      "apps/web/gms/src/a.ts app-imports-other-app",
    ]
  );
});

test("multi-line imports, own-package subpaths and nested build folders", () => {
  assert.deepEqual(
    rulesIn({
      "packages/auth/src/a.ts": 'import {\n  x,\n} from\n  "@sentry/nextjs";',
      "apps/web/auth/src/a.ts": 'import { y } from "@barrelsgd/web-auth/lib";',
      "apps/web/gms/src/app/build/route.ts": 'import { Pool } from "pg";',
      "apps/web/gms/build/out.js": 'import { Pool } from "pg";',
    }),
    [
      "apps/web/gms/src/app/build/route.ts route-handler-database",
      "packages/auth/src/a.ts package-imports-sentry",
    ]
  );
});

test("route handlers outside the CMS cannot open a database client", () => {
  assert.deepEqual(
    rulesIn({
      "apps/web/gms/src/app/api/x/route.ts": 'import { Pool } from "pg";',
      "apps/web/gms/src/lib/x.ts": 'import { Pool } from "pg";',
      "apps/web/cms/src/app/api/x/route.ts": 'import { Pool } from "pg";',
    }),
    ["apps/web/gms/src/app/api/x/route.ts route-handler-database"]
  );
});

test("comments, generated code and node_modules are ignored", () => {
  assert.deepEqual(
    rulesIn({
      "packages/ui/src/a.ts": [
        '// import "@sentry/nextjs";',
        'const a = 1; // import "@sentry/node"',
        '/* import "@sentry/x";',
        ' * from "@sentry/y" */',
      ].join("\n"),
      "packages/ui/node_modules/x/index.js": 'require("@sentry/node");',
      "packages/api-client/src/gen/x.ts": 'import "@barrelsgd/web-gms";',
    }),
    []
  );
});
