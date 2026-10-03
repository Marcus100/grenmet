import { PageIntro } from "@/components/editorial";
import { SearchReader } from "@/components/search-reader";
import { getBriefs, getCurrentArticles } from "@/lib/content";
import { getSection } from "@/lib/nav";
export const metadata = { title: "Search" };
export default function SearchPage() {
  const entries = [
    ...getCurrentArticles().map((article) => ({
      href: `/${article.section}/${article.slug}`,
      title: article.title,
      description: article.dek,
      label: getSection(article.section)?.label ?? article.section,
    })),
    ...getBriefs()
      .filter((brief) => brief.reviewStatus === "editorial-preview")
      .map((brief) => ({
        href: `/today/${brief.date}`,
        title: brief.title,
        description: brief.dek,
        label: "Daily Signal",
      })),
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <PageIntro eyebrow="Find your signal" title="What’s on your mind?">
        <p>
          Search the sourced summaries and editions in this editorial preview.
        </p>
      </PageIntro>
      <SearchReader entries={entries} />
    </div>
  );
}
