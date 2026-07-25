import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("./check-links.mjs", import.meta.url));

const write = (root, file, contents) => {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
};

const run = (root) =>
  spawnSync(process.execPath, [cliPath, "--root", root], {
    encoding: "utf8",
  });

test("directory links and GitHub-style punctuation anchors pass", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grenmet-doc-links-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  write(
    root,
    "README.md",
    [
      "# Home",
      "",
      "Browse the [guides](docs/) or [dependencies](docs/setup.md#pnpm--dependencies).",
      "",
    ].join("\n")
  );
  write(root, "docs/setup.md", "# Setup\n\n## pnpm / dependencies\n");

  const result = run(root);

  assert.equal(result.status, 0, result.stderr);
});

test("external links and fenced Markdown examples are not local targets", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grenmet-doc-links-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  write(
    root,
    "README.md",
    [
      "# Home",
      "",
      "[Website](https://example.com) and [email](mailto:ops@example.com).",
      "",
      "```md",
      "[Illustrative missing link](not-a-real-file.md)",
      "```",
      "",
      "````md",
      "```",
      "[Still illustrative](also-not-real.md)",
      "```",
      "````",
      "",
    ].join("\n")
  );

  const result = run(root);

  assert.equal(result.status, 0, result.stderr);
});

test("Setext headings and headings with inline markup use rendered anchors", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grenmet-doc-links-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  write(
    root,
    "README.md",
    [
      "# Home",
      "",
      "Read [setup](docs/setup.md#local-setup) and [API usage](docs/setup.md#use-the-api-client).",
      "",
    ].join("\n")
  );
  write(
    root,
    "docs/setup.md",
    [
      "Local *setup*",
      "-------------",
      "",
      "## Use the [API](https://example.com) `client`",
      "",
    ].join("\n")
  );

  const result = run(root);

  assert.equal(result.status, 0, result.stderr);
});
