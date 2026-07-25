import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("./check-links.mjs", import.meta.url));
const escapedRootPattern = /target escapes repository root/;
const failurePattern = /Documentation link check failed/;
const missingFilePattern = /missing\.md/;
const missingTargetPattern = /target file does not exist/;
const sourceLinePattern = /docs\/index\.md:5/;

const write = (root, file, contents) => {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
};

const run = (root) =>
  spawnSync(process.execPath, [cliPath, "--root", root], {
    encoding: "utf8",
  });

test("a missing local target reports its source line and destination", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grenmet-doc-links-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  write(
    root,
    "docs/index.md",
    "# Index\n\nSee the missing guide.\n\n[Open guide](missing.md)\n"
  );

  const result = run(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, failurePattern);
  assert.match(result.stderr, sourceLinePattern);
  assert.match(result.stderr, missingFilePattern);
  assert.match(result.stderr, missingTargetPattern);
});

test("a target outside the repository root is rejected", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grenmet-doc-links-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  write(root, "docs/index.md", "[Outside](../../../etc/passwd)\n");

  const result = run(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, escapedRootPattern);
});
