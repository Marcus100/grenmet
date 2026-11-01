/**
 * Pulls the page title and section list out of one MDX document.
 * Kept separate from generate-sections.mjs so it can be tested without
 * touching the filesystem.
 */
import { slugifyWithCounter } from "@sindresorhus/slugify";
import { toString as mdastToString } from "mdast-util-to-string";
import { mdxAnnotations } from "mdx-annotations";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import { visit } from "unist-util-visit";

// A leading YAML frontmatter block. Left in place, markdown reads its closing
// "---" as a setext underline, turning the last frontmatter line into a
// depth-2 heading that lands in the search index as a section title.
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

const processor = remark().use(remarkMdx).use(mdxAnnotations.remark);

export function extractPage(rawContent) {
  const mdxContent = rawContent.replace(FRONTMATTER, "");
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
