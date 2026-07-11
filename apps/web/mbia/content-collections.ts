import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import remarkGfm from "remark-gfm";
import { z } from "zod";

const SECTIONS = [
  "travel",
  "at-the-airport",
  "business",
  "corporate",
  "development",
  "news",
] as const;

// `_meta.path` uses the OS separator (backslashes on Windows).
const PATH_SEP = /[/\\]/;

const pages = defineCollection({
  name: "pages",
  directory: "content",
  include:
    "{travel,at-the-airport,business,corporate,development,news}/**/*.mdx",
  schema: z.object({
    title: z.string(),
    dek: z.string(),
    section: z.enum(SECTIONS),
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
    /** ISO date — required for news, optional elsewhere. */
    publishedAt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
  transform: async (doc, context) => {
    const body = await compileMDX(context, doc, {
      remarkPlugins: [remarkGfm],
    });
    const slug = doc._meta.path.split(PATH_SEP).at(-1) ?? doc._meta.fileName;
    return { ...doc, body, slug };
  },
});

export default defineConfig({ collections: [pages] });
