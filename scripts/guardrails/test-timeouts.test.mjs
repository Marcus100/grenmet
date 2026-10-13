// Web apps set a 30 s Vitest default because cold jsdom workers are slow under
// a full parallel run. Per-test overrides written for the old 5 s default now
// *lower* the limit and were the main source of "passes in isolation" flakes.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DEFAULT_MS = 30_000;
const WEB = "apps/web";
const CONFIG_TIMEOUT = /testTimeout:\s*([\d_]+)/g;
// `}, 20_000);` after a test body, or `{ timeout: 20_000 }` test options.
// Four or more digits: smaller values are waitFor polling windows, not test limits.
const OVERRIDE = /\},\s*(\d[\d_]{3,})\s*\);|\btimeout:\s*(\d[\d_]{3,})/g;
// Vitest suites only; `.test.mjs` files run under node:test with their own limits.
const TEST_FILE = /\.test\.tsx?$/;
const SKIP = new Set(["node_modules", ".next", "dist", "coverage"]);
const ms = (literal) => Number(literal.replaceAll("_", ""));

function* testFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* testFiles(path);
    else if (TEST_FILE.test(entry.name)) yield path;
  }
}

const apps = readdirSync(WEB, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

test("web app Vitest configs keep the 30 s default", () => {
  for (const app of apps) {
    const config = readdirSync(join(WEB, app)).find((name) =>
      name.startsWith("vitest.config.")
    );
    if (!config) continue;
    const source = readFileSync(join(WEB, app, config), "utf8");
    for (const [, value] of source.matchAll(CONFIG_TIMEOUT))
      assert.ok(
        ms(value) >= DEFAULT_MS,
        `${app}/${config}: testTimeout ${value}`
      );
  }
});

test("no web test lowers the timeout below the app default", () => {
  const offenders = [];
  for (const app of apps)
    for (const file of testFiles(join(WEB, app)))
      for (const [match, a, b] of readFileSync(file, "utf8").matchAll(OVERRIDE))
        if (ms(a ?? b) < DEFAULT_MS) offenders.push(`${file}: ${match.trim()}`);
  assert.deepEqual(
    offenders,
    [],
    "Remove these overrides; the app default is 30 s. Make the test faster instead of raising it further."
  );
});
