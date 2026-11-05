// Tailwind v4 only scans an app's own source. A shared package's components
// (@barrelsgd/ui primitives, the @barrelsgd/gms Logo) carry utilities that may
// appear nowhere in the app, so the app stylesheet must @source the package or
// those classes are never generated. The auth sign-in panel shipped with an
// invisible logo for exactly this reason: the Logo's dark:block never existed.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const APPS = join(root, "apps/web");
const TAILWIND = '@import "tailwindcss";';
const PACKAGES = ["ui", "gms"];
const SOURCE_FILE = /\.(tsx|ts)$/u;

function tailwindEntry(app) {
  for (const path of ["src/app/globals.css", "src/styles/tailwind.css"]) {
    const file = join(APPS, app, path);
    if (existsSync(file) && readFileSync(file, "utf8").includes(TAILWIND))
      return file;
  }
  return null;
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (SOURCE_FILE.test(name)) yield path;
  }
}

function importsComponents(app, pkg) {
  const src = join(APPS, app, "src");
  if (!existsSync(src)) return false;
  const needle = `@barrelsgd/${pkg}/components`;
  for (const file of sourceFiles(src))
    if (readFileSync(file, "utf8").includes(needle)) return true;
  return false;
}

test("apps that render shared components let Tailwind scan those packages", () => {
  const missing = [];
  for (const app of readdirSync(APPS)) {
    const entry = tailwindEntry(app);
    if (!entry) continue;
    const css = readFileSync(entry, "utf8");
    for (const pkg of PACKAGES) {
      const source = `@source "../../node_modules/@barrelsgd/${pkg}/src";`;
      if (importsComponents(app, pkg) && !css.includes(source))
        missing.push(`${app} → @barrelsgd/${pkg}`);
    }
  }
  assert.deepEqual(missing, [], `missing @source lines: ${missing.join(", ")}`);
});
