import Link from "next/link";
import { fetchPublishedContent } from "@/lib/cms";

interface NewsRow {
  byline: string;
  category: string;
  href: string;
  id: string;
  published: string;
  title: string;
}

function NewsRowItem({ row }: { row: NewsRow }) {
  return (
    <a
      className="flex flex-col gap-1.5 border-gm-border border-t py-4 first:border-t-0 first:pt-0"
      href={row.href}
    >
      <span className="font-semibold text-body-sm text-gm-blue-ink uppercase leading-body-sm tracking-wide">
        {row.category}
      </span>
      <span className="font-bold text-gm-navy text-nav leading-nav">
        {row.title}
      </span>
      <span className="text-body text-gm-text-muted leading-body">
        {row.byline} · {row.published}
      </span>
    </a>
  );
}

export async function WeatherNews() {
  const result = await fetchPublishedContent("weather-news");
  const rows: NewsRow[] = result.articles.map((article) => ({
    byline: "Weather News",
    category: "Weather News",
    href: `/news/${article.slug}`,
    id: article.id,
    published: new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "America/Grenada",
    }).format(new Date(article.updatedAt)),
    title: article.title,
  }));
  return (
    <section className="mb-8 space-y-5">
      <div className="flex items-center justify-between">
        <p className="font-bold text-gm-navy text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
          Weather News
        </p>
        <Link className="text-gm-blue-ink underline" href="/news">
          All news
        </Link>
      </div>
      {result.status === "unavailable" ? (
        <p role="status">Weather News is unavailable right now.</p>
      ) : rows.length === 0 ? (
        <p>No Weather News articles are published yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <NewsRowItem key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
