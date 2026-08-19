import { defineCollection, defineConfig } from "@content-collections/core";
import type { Options as MdxOptions } from "@content-collections/mdx";
import { compileMDX } from "@content-collections/mdx";
import { slugifyWithCounter } from "@sindresorhus/slugify";
import { toString as mdastToString } from "mdast-util-to-string";
import { mdxAnnotations } from "mdx-annotations";
import remarkGfm from "remark-gfm";
import type { Highlighter } from "shiki";
import { getHighlighter, renderToHtml } from "shiki";
import { visit } from "unist-util-visit";
import { z } from "zod";

// biome-ignore lint/suspicious/noExplicitAny: HAST/MDAST nodes have no shared type we can import without heavy deps
type AstNode = any;

// @content-collections/mdx v0.2 Options does not expose recmaPlugins — extend it locally
interface ExtendedMdxOptions extends MdxOptions {
  recmaPlugins?: NonNullable<MdxOptions["remarkPlugins"]>;
}

let highlighter: Highlighter | undefined;

const LANGUAGE_RE = /^language-/;

function rehypeParseCodeBlocks() {
  return (tree: AstNode) => {
    visit(tree, "element", (node: AstNode, _: unknown, parentNode: AstNode) => {
      if (node.tagName === "code" && parentNode) {
        parentNode.properties.language = node.properties.className
          ? node.properties.className[0]?.replace(LANGUAGE_RE, "")
          : "txt";
      }
    });
  };
}

function rehypeShikiHighlight() {
  return async (tree: AstNode) => {
    highlighter ??= await getHighlighter({ theme: "css-variables" });
    const h = highlighter;
    visit(tree, "element", (node: AstNode) => {
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
              pre: ({ children }: { children: string }) => children,
              code: ({ children }: { children: string }) => children,
              line: ({ children }: { children: string }) =>
                `<span>${children}</span>`,
            },
          });
        }
      }
    });
  };
}

function rehypeSlugify() {
  return (tree: AstNode) => {
    const slugify = slugifyWithCounter();
    visit(tree, "element", (node: AstNode) => {
      if (node.tagName === "h2" && !node.properties.id) {
        node.properties.id = slugify(mdastToString(node));
      }
    });
  };
}

function captureH2s(out: { id: string; title: string }[]) {
  return function plugin() {
    const slugify = slugifyWithCounter();
    return function transformer(tree: AstNode) {
      visit(tree, "heading", (node: AstNode) => {
        if (node.depth === 2) {
          const title = mdastToString(node);
          out.push({ id: slugify(title), title });
        }
      });
    };
  };
}

const pages = defineCollection({
  name: "hurricanepages",
  directory: "src/content",
  include: "**/*.mdx",
  schema: z.object({
    title: z.string(),
    description: z.string().optional().default(""),
  }),
  transform: async (page, context) => {
    const sections: { id: string; title: string }[] = [];
    const mdxOptions: ExtendedMdxOptions = {
      remarkPlugins: [remarkGfm, mdxAnnotations.remark, captureH2s(sections)],
      rehypePlugins: [
        mdxAnnotations.rehype,
        rehypeParseCodeBlocks,
        rehypeShikiHighlight,
        rehypeSlugify,
      ],
      recmaPlugins: [mdxAnnotations.recma],
    };
    const body = await compileMDX(context, page, mdxOptions);
    return { ...page, body, sections };
  },
});

export default defineConfig({ collections: [pages] });
