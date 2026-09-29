import { cache } from "react";
import { z } from "zod";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

export const CONTENT_COLLECTIONS = [
  "desk-updates",
  "stories",
  "publications",
] as const;
export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

const contentSchema = z.object({
  id: z.string(),
  collection: z.enum(CONTENT_COLLECTIONS),
  title: z.string(),
  slug: z.string(),
  kicker: z.string().nullable().optional(),
  summary: z.string().nullable(),
  category: z.string().nullable().optional(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable().optional(),
  imageCredit: z.string().nullable().optional(),
  imageCaption: z.string().nullable().optional(),
  topics: z.array(z.string()).optional(),
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  series: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  keyFindings: z.array(z.string()).optional(),
  document: z
    .object({
      url: z.string(),
      filename: z.string(),
      mimeType: z.string().nullable(),
      filesize: z.number().nullable(),
    })
    .nullable()
    .optional(),
  relatedLinks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        category: z.enum([
          "forecast",
          "cap",
          "aviation",
          "bulletin",
          "publication",
          "article",
          "source",
        ]),
        url: z
          .url()
          .max(2000)
          .refine((value) => {
            if (!URL.canParse(value)) return false;
            const url = new URL(value);
            return (
              ["http:", "https:"].includes(url.protocol) &&
              !url.username &&
              !url.password
            );
          }),
      })
    )
    .max(20)
    .optional(),
});
export type PublishedContent = z.infer<typeof contentSchema>;

export type ContentResult =
  | { status: "ok"; articles: PublishedContent[] }
  | { status: "unavailable"; articles: [] };

function cmsUrl(path: string) {
  return new URL(path, env.CMS_API_URL);
}
const requestOptions = () => ({
  cache: "no-store" as const,
  signal: AbortSignal.timeout(5000),
});

async function getContent(params: {
  slug?: string;
  collection?: ContentCollection;
}): Promise<ContentResult> {
  if (!env.CMS_API_URL) return { status: "unavailable", articles: [] };
  try {
    const url = cmsUrl("/api/public/articles");
    if (params.collection)
      url.searchParams.set("collection", params.collection);
    if (params.slug) url.searchParams.set("slug", params.slug);
    const response = await fetch(url, requestOptions());
    if (!response.ok) return { status: "unavailable", articles: [] };
    const parsed = z
      .object({ articles: z.array(contentSchema) })
      .safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-cms-contract");
      return { status: "unavailable", articles: [] };
    }
    return { status: "ok", articles: parsed.data.articles };
  } catch (error) {
    reportError(error, "gms-cms");
    return { status: "unavailable", articles: [] };
  }
}

/** Published articles, newest first; all three collections when none given. */
export const fetchPublishedContent = cache(function fetchPublishedContent(
  collection?: ContentCollection
): Promise<ContentResult> {
  return getContent({ collection });
});

export const fetchContentBySlug = cache(function fetchContentBySlug(
  slug: string
): Promise<ContentResult> {
  return getContent({ slug });
});

const partSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), items: z.array(contentSchema) }),
  z.object({ status: z.literal("unavailable") }),
]);
const homeSchema = z.object({
  deskUpdates: partSchema,
  stories: partSchema,
  publications: partSchema,
});
export type HomeContent = Record<
  keyof z.infer<typeof homeSchema>,
  ContentResult
>;

const UNAVAILABLE: ContentResult = { status: "unavailable", articles: [] };
const toResult = (part: z.infer<typeof partSchema>): ContentResult =>
  part.status === "ok" ? { status: "ok", articles: part.items } : UNAVAILABLE;

/**
 * Everything the homepage reads from the CMS, in one request. Each section
 * keeps its own state, so one failing part never hides the others.
 */
export const fetchHomeContent = cache(
  async function fetchHomeContent(): Promise<HomeContent> {
    const down = {
      deskUpdates: UNAVAILABLE,
      stories: UNAVAILABLE,
      publications: UNAVAILABLE,
    };
    if (!env.CMS_API_URL) return down;
    try {
      const response = await fetch(
        cmsUrl("/api/public/home"),
        requestOptions()
      );
      if (!response.ok) return down;
      const parsed = homeSchema.safeParse(await response.json());
      if (!parsed.success) {
        reportError(parsed.error, "gms-cms-home-contract");
        return down;
      }
      return {
        deskUpdates: toResult(parsed.data.deskUpdates),
        stories: toResult(parsed.data.stories),
        publications: toResult(parsed.data.publications),
      };
    } catch (error) {
      reportError(error, "gms-cms-home");
      return down;
    }
  }
);

/** Every CMS article shares one detail route; slugs carry their collection. */
export const contentHref = (content: Pick<PublishedContent, "slug">) =>
  `/explore/news/${content.slug}`;
