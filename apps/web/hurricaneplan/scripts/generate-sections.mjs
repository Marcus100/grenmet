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
import { slugifyWithCounter } from "@sindresorhus/slugify";
import glob from "fast-glob";
import { toString as mdastToString } from "mdast-util-to-string";
import { mdxAnnotations } from "mdx-annotations";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import { visit } from "unist-util-visit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentDir = join(__dirname, "../src/content");
const outDir = join(__dirname, "../src/data");
const outFile = join(outDir, "sections.json");

const processor = remark().use(remarkMdx).use(mdxAnnotations.remark);

function extractPage(mdxContent) {
  const slugify = slugifyWithCounter();
  let pageTitle = null;
  const sections = [];

  const tree = processor.parse(mdxContent);
  processor.runSync(tree, { value: mdxContent });

  visit(tree, "heading", (node) => {
    if (node.depth === 1 && pageTitle === null) {
      pageTitle = mdastToString(node);
    } else if (node.depth === 2) {
      const title = mdastToString(node);
      const id = slugify(title);
      const annotation = node.data?.hProperties?.annotation;
      const section = { id, title };
      if (annotation?.tag) section.tag = annotation.tag;
      sections.push(section);
    }
  });

  return { pageTitle, sections };
}

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
