import assert from "node:assert/strict";
import test from "node:test";
import { collect, findPrivateContent } from "./check-private-content.mjs";

const find = (path, content) => findPrivateContent([{ content, path }]);

test("flags Obsidian wikilinks in markdown", () => {
  assert.equal(find("docs/x.md", "See [[project-register]].").length, 1);
  assert.equal(find("docs/x.md", "See [[ml|ML map]].").length, 1);
});

test("allows Next.js catch-all segments and wikilinks in code", () => {
  assert.deepEqual(
    find("apps/web/docs/AGENTS.md", "`src/app/[[...slug]]/page.tsx`"),
    []
  );
  assert.deepEqual(find("packages/ui/src/x.tsx", "[[note]]"), []);
});

test("flags Bishop note frontmatter", () => {
  assert.equal(find("docs/a.md", "---\ntype: source-summary\n---\n").length, 1);
  assert.equal(find("docs/b.md", "---\ndomain: 01-eugine\n---\n").length, 1);
  assert.deepEqual(
    find("docs/c.md", "---\ntype: guide\ndomain: api\n---\n"),
    []
  );
});

test("flags Bishop vault folder layout in any file", () => {
  assert.equal(find("wiki/98-sources/x.md", "").length, 1);
  assert.equal(
    find("scripts/bishop-weather/raw/02-atmosphere-aviation/a.csv").length,
    1
  );
  assert.deepEqual(
    find("scripts/bishop-weather/tools/tides/audit_pric.py"),
    []
  );
});

test("the tracked repository carries no Bishop vault content", () => {
  assert.deepEqual(findPrivateContent(collect("--all")), []);
});
