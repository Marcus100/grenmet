import { CmsArticle, cmsArticleMetadata } from "@/components/cms-article";
import { contentSlug } from "@/lib/cms";

type Params = Promise<{ slug: string[] }>;

export async function generateMetadata({ params }: { params: Params }) {
  return cmsArticleMetadata(contentSlug("desk-updates", (await params).slug));
}

/** A desk update: /explore/updates/2026/09/<title>. Only published CMS posts. */
export default async function UpdatePage({ params }: { params: Params }) {
  return CmsArticle({ slug: contentSlug("desk-updates", (await params).slug) });
}
