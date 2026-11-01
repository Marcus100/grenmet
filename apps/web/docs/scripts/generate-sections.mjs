#!/usr/bin/env node
/**
 * Generates src/data/sections.json from all MDX content files.
 * Run before `next dev` or `next build`.
 *
 * Output shape: { [pathname: string]: { pageTitle: string | null, sections: Section[] } }
 * where Section = { id: string; title: string; tag?: string }
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import glob from "fast-glob";
import { extractPage } from "./extract-page.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentDir = join(__dirname, "../src/content");
const outDir = join(__dirname, "../src/data");
const outFile = join(outDir, "sections.json");

// MDX files are now in src/content/ (flat slugs, no page.mdx nesting)
// index.mdx → pathname "/"
// foo.mdx → pathname "/foo"
// foo/bar.mdx → pathname "/foo/bar"
const files = glob.sync("**/*.mdx", { cwd: contentDir });
const allSections = {};

for (const file of files) {
  const slug = file.replace(/\.mdx$/, "");
  const pathname = slug === "index" ? "/" : `/${slug}`;
  const content = readFileSync(join(contentDir, file), "utf8");
  allSections[pathname] = extractPage(content);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(allSections, null, 2)}\n`);

const totalSections = Object.values(allSections).reduce(
  (sum, page) => sum + page.sections.length,
  0
);
console.log(
  `✓ sections.json — ${files.length} pages, ${totalSections} sections`
);
