import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// Imported by path: the "content-collections" alias is a tsconfig path, and
// tests need no lint exemption for it this way.
import { allHurricanepages } from "../.content-collections/generated";

// The generated collection comes from `content-collections build`, which the
// test script runs first. A page whose frontmatter does not parse (for example
// an unescaped quote) is dropped from the collection without failing that
// build, so its URL silently 404s; this test makes it fail instead.
const CONTENT_DIR = path.resolve(import.meta.dirname, "content");
const MDX_EXTENSION = /\.mdx$/;

function contentFiles(): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replaceAll("\\", "/").replace(MDX_EXTENSION, ""))
    .sort();
}

describe("docs content collection", () => {
  it("contains every content file", () => {
    const collected = allHurricanepages
      .map((page) => page._meta.path.replaceAll("\\", "/"))
      .sort();
    expect(contentFiles().length).toBeGreaterThan(0);
    expect(collected).toEqual(contentFiles());
  });
});
