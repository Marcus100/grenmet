import type { Metadata } from "next";
import { CmsArticleBody } from "@/components/cms-article";
import { fetchPreview } from "@/lib/cms-preview";

/** Drafts are never cached, never indexed, and never listed in the sitemap or nav. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false, nocache: true },
};

type SearchParams = Promise<{ token?: string | string[] }>;

const NOTICE =
  "mb-6 rounded-gm-card border border-gm-border p-4 text-body leading-body";

/** A preview of one unpublished post, behind a signed link from the CMS. */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;
  const result = await fetchPreview(typeof token === "string" ? token : "");

  if (result.status === "invalid")
    return (
      <section aria-labelledby="preview-heading" className={NOTICE}>
        <h1 className="text-heading-sm font-bold" id="preview-heading">
          This preview link is not valid
        </h1>
        <p>
          It may have expired (a preview link lasts two hours) or been copied
          incompletely. Ask the editor for a new preview link.
        </p>
      </section>
    );

  if (result.status === "unavailable")
    return (
      <p className={NOTICE} role="status">
        This preview cannot be loaded right now. Please try again later.
      </p>
    );

  if (result.status === "unsupported")
    return (
      <p className={NOTICE} role="status">
        Previews on the site are available for desk updates, stories and report
        write-ups only.
      </p>
    );

  return (
    <>
      <p className={NOTICE} role="status">
        {result.draft
          ? "Preview of an unpublished draft. Only people with this link can see it."
          : "Preview of a published post."}
      </p>
      <CmsArticleBody content={result.content} />
    </>
  );
}
