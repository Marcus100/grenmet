// content-collections.ts
import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import remarkGfm from "remark-gfm";
import { z } from "zod";
var SECTIONS = [
  "travel",
  "at-the-airport",
  "business",
  "corporate",
  "development",
  "news"
];
var PATH_SEP = /[/\\]/;
var pages = defineCollection({
  name: "pages",
  directory: "content",
  include: "{travel,at-the-airport,business,corporate,development,news}/**/*.mdx",
  schema: z.object({
    title: z.string(),
    dek: z.string(),
    section: z.enum(SECTIONS),
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
    /** ISO date — required for news, optional elsewhere. */
    publishedAt: z.string().optional(),
    draft: z.boolean().default(false)
  }),
  transform: async (doc, context) => {
    const body = await compileMDX(context, doc, {
      remarkPlugins: [remarkGfm]
    });
    const slug = doc._meta.path.split(PATH_SEP).at(-1) ?? doc._meta.fileName;
    return { ...doc, body, slug };
  }
});
var content_collections_default = defineConfig({ collections: [pages] });
export {
  content_collections_default as default
};
