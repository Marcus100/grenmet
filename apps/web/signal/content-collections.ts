import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import remarkGfm from "remark-gfm";
import { z } from "zod";

const SECTIONS = ["weather-ready", "check-d-ting", "opportunity"] as const;

// `_meta.path` uses the OS separator (backslashes on Windows).
const PATH_SEP = /[/\\]/;

const sourceSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

const articles = defineCollection({
  name: "articles",
  directory: "content",
  // All section folders; the briefs folder is handled by its own collection.
  include: "{weather-ready,check-d-ting,opportunity}/**/*.mdx",
  schema: z.object({
    title: z.string(),
    dek: z.string(),
    section: z.enum(SECTIONS),
    author: z.string(),
    publishedAt: z.string(), // ISO date, e.g. "2026-06-13"
    heroImage: z.string(),
    heroAlt: z.string(),
    tags: z.array(z.string()).default([]),
    sources: z.array(sourceSchema).default([]),
    draft: z.boolean().default(false),
  }),
  transform: async (doc, context) => {
    const body = await compileMDX(context, doc, {
      remarkPlugins: [remarkGfm],
    });
    // `_meta.path` is the path under `directory` without extension,
    // e.g. "weather-ready/saharan-dust" -> slug "saharan-dust".
    const slug = doc._meta.path.split(PATH_SEP).at(-1) ?? doc._meta.fileName;
    return { ...doc, body, slug };
  },
});

const briefs = defineCollection({
  name: "briefs",
  directory: "content/briefs",
  include: "**/*.mdx",
  schema: z.object({
    date: z.string(), // ISO date, doubles as the [date] route param
    title: z.string(),
    presenter: z.string(),
    dek: z.string(),
  }),
  transform: async (doc, context) => {
    const body = await compileMDX(context, doc, {
      remarkPlugins: [remarkGfm],
    });
    return { ...doc, body };
  },
});

export default defineConfig({ collections: [articles, briefs] });
