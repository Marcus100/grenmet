import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkDrift } from "./check-api-drift.mjs";

const missingPattern = /ENOENT/;
const emptyPattern = /empty/;
const failurePattern = /generator failed/;
const noOutputPattern = /no client files/;

function put(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "api-drift-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    "apps/api/fastapi/openapi.json",
    "biome.jsonc",
    ".gitignore",
    "packages/api-client/package.json",
    "packages/api-client/kubb.config.ts",
  ])
    put(root, path, "{}");
  put(root, "packages/api-client/src/gen/index.ts", "export {};\n");
  return root;
}

const output = "packages/api-client/src/gen/index.ts";

test("matching content passes regardless of timestamps and cleans temporary output", (t) => {
  const root = fixture(t);
  utimesSync(join(root, output), 1, 1);
  let temporary;
  assert.deepEqual(
    checkDrift(root, (directory) => {
      temporary = directory;
      assert.equal(
        readFileSync(join(directory, "apps/api/fastapi/openapi.json"), "utf8"),
        "{}"
      );
      put(directory, output, "export {};\n");
    }),
    []
  );
  assert.equal(existsSync(temporary), false);
  assert.equal(readFileSync(join(root, output), "utf8"), "export {};\n");
});

test("reports changed, extra and missing nested files without changing working files", (t) => {
  const root = fixture(t);
  put(root, "packages/api-client/src/gen/old.ts", "old");
  const differences = checkDrift(root, (directory) => {
    put(directory, output, "changed");
    put(directory, "packages/api-client/src/gen/models/new.ts", "new");
  });
  assert.deepEqual(differences, [
    "Changed: index.ts",
    "Missing: models/new.ts",
    "Extra: old.ts",
  ]);
  assert.equal(readFileSync(join(root, output), "utf8"), "export {};\n");
  assert.equal(
    readFileSync(join(root, "packages/api-client/src/gen/old.ts"), "utf8"),
    "old"
  );
  assert.equal(
    existsSync(join(root, "packages/api-client/src/gen/models/new.ts")),
    false
  );
});

test("missing specification fails before invoking generation", (t) => {
  const root = fixture(t);
  rmSync(join(root, "apps/api/fastapi/openapi.json"));
  assert.throws(
    () => checkDrift(root, () => assert.fail("must not generate")),
    missingPattern
  );
});

test("missing or empty working client fails", (t) => {
  const root = fixture(t);
  rmSync(join(root, output));
  assert.throws(
    () => checkDrift(root, () => assert.fail("must not generate")),
    emptyPattern
  );
  rmSync(join(root, "packages/api-client/src/gen"), { recursive: true });
  assert.throws(
    () => checkDrift(root, () => assert.fail("must not generate")),
    missingPattern
  );
});

test("generator failure is propagated and partial output is cleaned", (t) => {
  const root = fixture(t);
  let temporary;
  assert.throws(
    () =>
      checkDrift(root, (directory) => {
        temporary = directory;
        put(directory, output, "partial");
        throw new Error("generator failed");
      }),
    failurePattern
  );
  assert.equal(existsSync(temporary), false);
  assert.equal(readFileSync(join(root, output), "utf8"), "export {};\n");
});

test("missing or empty generator output fails", (t) => {
  const root = fixture(t);
  assert.throws(() => checkDrift(root, () => undefined), missingPattern);
  assert.throws(
    () =>
      checkDrift(root, (directory) => {
        mkdirSync(join(directory, "packages/api-client/src/gen"), {
          recursive: true,
        });
      }),
    noOutputPattern
  );
});
