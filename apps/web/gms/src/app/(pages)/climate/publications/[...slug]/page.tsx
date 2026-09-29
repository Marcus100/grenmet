import { CmsArticle, cmsArticleMetadata } from "@/components/cms-article";
import { contentSlug } from "@/lib/cms";

type Params = Promise<{ slug: string[] }>;

export async function generateMetadata({ params }: { params: Params }) {
  return cmsArticleMetadata(contentSlug("publications", (await params).slug));
}

/** A report: /climate/publications/2026/09/<title>. */
export default async function PublicationPage({ params }: { params: Params }) {
  return CmsArticle({ slug: contentSlug("publications", (await params).slug) });
}
