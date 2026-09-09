import Link from "next/link";
import { notFound } from "next/navigation";
import { WEATHER_ARTICLES } from "@/lib/editorial";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title:
      WEATHER_ARTICLES.find((article) => article.slug === slug)?.title ??
      "Weather news",
  };
}
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = WEATHER_ARTICLES.find((item) => item.slug === slug);
  if (!article) notFound();
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-4">
        <p className="font-semibold text-muted-foreground">
          Weather news · GMS · {article.published}
        </p>
        <h1 className="font-bold text-3xl">{article.title}</h1>
        <p className="text-lg">{article.summary}</p>
      </header>
      {article.sections.map((section) => (
        <section className="space-y-4" key={section.heading}>
          <h2 className="font-semibold text-xl">{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p className="leading-7" key={p}>
              {p}
            </p>
          ))}
        </section>
      ))}
      {article.sources?.map((source) => (
        <p key={source.url}>
          Further reading:{" "}
          <a className="underline" href={source.url}>
            {source.title}
          </a>
        </p>
      ))}
      <Link className="underline" href="/news">
        More weather news
      </Link>
    </article>
  );
}
