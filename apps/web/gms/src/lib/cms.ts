import { z } from "zod";
import { env } from "@/lib/env";

const contentSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  kind: z.enum(["article", "page"]),
  summary: z.string().nullable(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  updatedAt: z.string(),
});
export type PublishedContent = z.infer<typeof contentSchema>;

export type ContentResult =
  | { status: "ok"; articles: PublishedContent[] }
  | { status: "unavailable"; articles: [] };

async function getContent(params: {
  kind?: "article" | "page";
  slug?: string;
  placement?: "latest" | "news";
}): Promise<ContentResult> {
  if (!env.CMS_API_URL) return { status: "unavailable", articles: [] };
  try {
    const url = new URL("/api/public/content", env.CMS_API_URL);
    if (params.kind) url.searchParams.set("kind", params.kind);
    if (params.placement) url.searchParams.set("placement", params.placement);
    if (params.slug) url.searchParams.set("slug", params.slug);
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { status: "unavailable", articles: [] };
    const parsed = z
      .object({ articles: z.array(contentSchema) })
      .safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable", articles: [] };
    return { status: "ok", articles: parsed.data.articles };
  } catch {
    return { status: "unavailable", articles: [] };
  }
}

export function fetchPublishedContent(
  kind?: "article" | "page",
  placement?: "latest" | "news"
): Promise<ContentResult> {
  return getContent({ kind, placement });
}

export async function fetchContentBySlug(
  slug: string
): Promise<PublishedContent | undefined> {
  const result = await getContent({ slug });
  return result.articles[0];
}
