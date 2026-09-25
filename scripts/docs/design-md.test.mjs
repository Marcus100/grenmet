import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// docs/design/<lane>.md restates CSS tokens for agents (DESIGN.md format). The
// CSS stays the source of truth; this guards the restatement against drift.
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, "utf8").toLowerCase();

const sources = {
  "gaa-admin.md": [
    "packages/gms/src/styles/foundation.css",
    "apps/web/gaa-admin/src/app/globals.css",
  ],
  "gms.md": ["packages/gms/src/styles/foundation.css"],
  "mbia.md": ["apps/web/mbia/src/app/globals.css"],
  "signal.md": ["apps/web/signal/src/app/globals.css"],
};

const frontMatterPattern = /^---\n([\s\S]*?)\n---\n/;
const colorBlockPattern = /^colors:\n((?: {2}.+\n)+)/m;
const colorEntryPattern = /^ {2}([a-z0-9-]+): "(#[0-9a-f]{6})"$/gm;

const specs = readdirSync(`${root}docs/design`).filter((file) =>
  file.endsWith(".md")
);

test("every lane spec has a source mapping", () => {
  assert.deepEqual(specs.sort(), Object.keys(sources).sort());
});

for (const spec of specs) {
  test(`${spec} colours exist in its CSS sources`, () => {
    const text = read(`docs/design/${spec}`);
    const frontMatter = text.match(frontMatterPattern)?.[1];
    assert.ok(frontMatter, "missing YAML front matter");
    const block = `${frontMatter}\n`.match(colorBlockPattern)?.[1];
    assert.ok(block, "missing colors block");
    const css = sources[spec].map(read).join("\n");
    const entries = [...block.matchAll(colorEntryPattern)];
    assert.ok(entries.length > 0, "no colour entries parsed");
    for (const [, name, hex] of entries) {
      assert.ok(css.includes(hex), `${name} ${hex} not found in CSS sources`);
    }
  });
}
