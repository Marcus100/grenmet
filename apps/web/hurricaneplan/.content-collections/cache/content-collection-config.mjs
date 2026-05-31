// content-collections.ts
import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import { slugifyWithCounter } from "@sindresorhus/slugify";
import { toString as mdastToString } from "mdast-util-to-string";
import { mdxAnnotations } from "mdx-annotations";
import remarkGfm from "remark-gfm";
import { getHighlighter, renderToHtml } from "shiki";
import { visit } from "unist-util-visit";
import { z } from "zod";
var highlighter;
var LANGUAGE_RE = /^language-/;
function rehypeParseCodeBlocks() {
  return (tree) => {
    visit(tree, "element", (node, _, parentNode) => {
      if (node.tagName === "code" && parentNode) {
        parentNode.properties.language = node.properties.className ? node.properties.className[0]?.replace(LANGUAGE_RE, "") : "txt";
      }
    });
  };
}
function rehypeShikiHighlight() {
  return async (tree) => {
    highlighter ??= await getHighlighter({ theme: "css-variables" });
    const h = highlighter;
    visit(tree, "element", (node) => {
      if (node.tagName === "pre" && node.children[0]?.tagName === "code") {
        const codeNode = node.children[0];
        const textNode = codeNode.children[0];
        node.properties.code = textNode.value;
        if (node.properties.language) {
          const tokens = h.codeToThemedTokens(
            textNode.value,
            node.properties.language
          );
          textNode.value = renderToHtml(tokens, {
            elements: {
              pre: ({ children }) => children,
              code: ({ children }) => children,
              line: ({ children }) => `<span>${children}</span>`
            }
          });
        }
      }
    });
  };
}
function rehypeSlugify() {
  return (tree) => {
    const slugify = slugifyWithCounter();
    visit(tree, "element", (node) => {
      if (node.tagName === "h2" && !node.properties.id) {
        node.properties.id = slugify(mdastToString(node));
      }
    });
  };
}
function captureH2s(out) {
  return function plugin() {
    const slugify = slugifyWithCounter();
    return function transformer(tree) {
      visit(tree, "heading", (node) => {
        if (node.depth === 2) {
          const title = mdastToString(node);
          out.push({ id: slugify(title), title });
        }
      });
    };
  };
}
var pages = defineCollection({
  name: "hurricanepages",
  directory: "src/content",
  include: "**/*.mdx",
  schema: z.object({
    title: z.string(),
    description: z.string().optional().default("")
  }),
  transform: async (page, context) => {
    const sections = [];
    const mdxOptions = {
      remarkPlugins: [remarkGfm, mdxAnnotations.remark, captureH2s(sections)],
      rehypePlugins: [
        mdxAnnotations.rehype,
        rehypeParseCodeBlocks,
        rehypeShikiHighlight,
        rehypeSlugify
      ],
      recmaPlugins: [mdxAnnotations.recma]
    };
    const body = await compileMDX(context, page, mdxOptions);
    return { ...page, body, sections };
  }
});
var content_collections_default = defineConfig({ collections: [pages] });
export {
  content_collections_default as default
};
