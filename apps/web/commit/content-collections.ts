import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import remarkGfm from "remark-gfm";
import { z } from "zod";

// One MDX file per post in content/posts. The file name is the anchor on the
// page (`/#v1-0-0`), so never rename a published file.
const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "*.mdx",
  schema: z.object({
    content: z.string(),
    title: z.string(),
    summary: z.string(),
    // ISO date, e.g. "2026-10-27".
    date: z.iso.date(),
    // Release this post describes, e.g. "1.0.0" (tag v1.0.0). Omit for
    // posts that are not tied to a release.
    release: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
    draft: z.boolean().default(false),
  }),
  transform: async (doc, context) => {
    const body = await compileMDX(context, doc, {
      remarkPlugins: [remarkGfm],
    });
    return { ...doc, body, slug: doc._meta.path };
  },
});

export default defineConfig({
  collections: [posts],
});
