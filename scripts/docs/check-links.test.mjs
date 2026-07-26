import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("./check-links.mjs", import.meta.url));
const markdownFileCountPattern = /2 Markdown files/;
const successPattern = /Documentation links passed/;

const write = (root, file, contents) => {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
};

const run = (root) =>
  spawnSync(process.execPath, [cliPath, "--root", root], {
    encoding: "utf8",
  });

test("valid relative documentation links and heading anchors pass", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grenmet-doc-links-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  write(
    root,
    "README.md",
    "# Home\n\nRead the [setup guide](docs/setup.md#local-setup).\n"
  );
  write(root, "docs/setup.md", "# Setup\n\n## Local setup\n");

  const result = run(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, successPattern);
  assert.match(result.stdout, markdownFileCountPattern);
});
