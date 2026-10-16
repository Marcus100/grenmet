// Every Tailwind web app imports the shared app-feel stylesheet
// (packages/ui/src/styles/app-feel.css), so taps, scrolling inside dialogs and
// reduced motion behave the same everywhere. A new app that forgets the import
// would silently feel different; this catches it.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const APPS = join(root, "apps/web");
// Payload's admin UI ships its own styles; barrels is a static HTML site.
const EXEMPT = new Set(["cms", "barrels"]);
const IMPORT = '@import "@barrelsgd/ui/styles/app-feel";';
const TAILWIND = '@import "tailwindcss";';

function tailwindEntry(app) {
  for (const path of ["src/app/globals.css", "src/styles/tailwind.css"]) {
    const file = join(APPS, app, path);
    if (existsSync(file) && readFileSync(file, "utf8").includes(TAILWIND))
      return file;
  }
  return null;
}

test("every Tailwind web app imports the app-feel stylesheet after Tailwind", () => {
  const missing = [];
  for (const app of readdirSync(APPS)) {
    if (EXEMPT.has(app)) continue;
    const entry = tailwindEntry(app);
    if (!entry) continue;
    const css = readFileSync(entry, "utf8");
    const at = css.indexOf(IMPORT);
    if (at === -1 || at < css.indexOf(TAILWIND)) missing.push(app);
  }
  assert.deepEqual(missing, [], `apps without the app-feel import: ${missing}`);
});
