import { CmsArticle, cmsArticleMetadata } from "@/components/cms-article";
import { contentSlug } from "@/lib/cms";

type Params = Promise<{ slug: string[] }>;

export async function generateMetadata({ params }: { params: Params }) {
  return cmsArticleMetadata(contentSlug("report-notes", (await params).slug));
}

/** A report write-up: /explore/reports/2026/09/<title>. */
export default async function ReportNotePage({ params }: { params: Params }) {
  return CmsArticle({ slug: contentSlug("report-notes", (await params).slug) });
}
