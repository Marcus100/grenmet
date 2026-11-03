// Every web app wires its own Sentry `captureException` into the shared
// `createReportError` factory (shared packages must not import Sentry). The
// wiring is identical by design, so any difference means logic leaked back into
// an app copy and the copies can drift again.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(root, "apps", "web");
const FILE = join("src", "lib", "report-error.ts");
const COMMENT_LINE = /^\s*(?:\/?\*|\/\*\*)/u;
const WIRING =
  "export const reportError = createReportError(captureException);";
const IMPORTS = [
  'import { createReportError } from "@barrelsgd/ui/lib/report-error";',
  'import { captureException } from "@sentry/nextjs";',
];

const apps = readdirSync(WEB, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    try {
      readFileSync(join(WEB, name, FILE));
      return true;
    } catch {
      return false;
    }
  });

test("apps with a report-error file are the Sentry-instrumented ones", () => {
  assert.ok(apps.length >= 7, `expected at least 7 apps, found ${apps.length}`);
});

test("each app's report-error.ts only wires captureException into the factory", () => {
  for (const app of apps) {
    const source = readFileSync(join(WEB, app, FILE), "utf8");
    for (const line of [...IMPORTS, WIRING])
      assert.ok(source.includes(line), `${app}: missing \`${line}\``);
    const code = source
      .split("\n")
      .filter((line) => line.trim() && !COMMENT_LINE.test(line));
    assert.equal(
      code.length,
      3,
      `${app}: report-error.ts must stay a 3-line wiring file`
    );
  }
});
