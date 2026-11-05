import { CmsArticle, cmsArticleMetadata } from "@/components/cms-article";
import { contentSlug } from "@/lib/cms";

type Params = Promise<{ slug: string[] }>;

export async function generateMetadata({ params }: { params: Params }) {
  return cmsArticleMetadata(contentSlug("stories", (await params).slug));
}

/** A story: /explore/news/2026/09/<title>. */
export default async function StoryPage({ params }: { params: Params }) {
  return CmsArticle({ slug: contentSlug("stories", (await params).slug) });
}
