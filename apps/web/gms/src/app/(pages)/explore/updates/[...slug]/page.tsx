import Link from "next/link";
import { CmsArticle, cmsArticleMetadata } from "@/components/cms-article";
import { ProductUpdateFeed } from "@/components/product-update-feed";
import { contentSlug } from "@/lib/cms";
import { REFERENCE_POSTS } from "@/lib/editorial";

type Params = Promise<{ slug: string[] }>;

/** The dated sample posts from 8 September 2026 keep their one-part URLs. */
const samplePost = (parts: string[]) =>
  parts.length === 1
    ? REFERENCE_POSTS.find((post) => post.id === parts[0])
    : undefined;

export async function generateMetadata({ params }: { params: Params }) {
  const parts = (await params).slug;
  const sample = samplePost(parts);
  if (sample) return { title: sample.title };
  return cmsArticleMetadata(contentSlug("desk-updates", parts));
}

/** A desk update: /explore/updates/2026/09/<title>. */
export default async function UpdatePage({ params }: { params: Params }) {
  const parts = (await params).slug;
  const post = samplePost(parts);
  if (!post) return CmsArticle({ slug: contentSlug("desk-updates", parts) });
  return (
    <div className="space-y-5">
      <p className="rounded-lg border p-4">
        A dated update based on the supplied GMS report of 8 September 2026.
        Check the current product pages for newer information.
      </p>
      <ProductUpdateFeed posts={[post]} />
      <Link className="underline" href="/weather/issued">
        Current issued forecasts
      </Link>
    </div>
  );
}
