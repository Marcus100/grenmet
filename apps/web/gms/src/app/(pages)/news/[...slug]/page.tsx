import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { fetchContentBySlug } from "@/lib/cms";
import { contentToArticle } from "@/lib/editorial";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugParts } = await params;
  const slug = slugParts.join("/");
  const result = await fetchContentBySlug(slug);
  return { title: result.articles[0]?.title ?? "GMS article" };
}
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugParts } = await params;
  const slug = slugParts.join("/");
  const result = await fetchContentBySlug(slug);
  if (result.status === "unavailable") {
    return (
      <p role="status">
        This article cannot be retrieved right now. Please try again later.
      </p>
    );
  }
  const content = result.articles[0];
  if (!content) notFound();
  const article = contentToArticle(content);
  const section = {
    "latest-from-us": { title: "Latest from us", href: "/updates" },
    "weather-news": { title: "Weather news", href: "/" },
    "latest-publications": { title: "Latest publications", href: "/news" },
  }[content.section ?? "latest-publications"];
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-4">
        <p className="font-semibold text-muted-foreground">
          {section.title} · GMS · {article.published}
        </p>
        <h1 className="font-bold text-3xl">{article.title}</h1>
        {content.category && (
          <p className="text-muted-foreground">{content.category}</p>
        )}
        <p className="text-lg">{article.summary}</p>
      </header>
      {article.body ? (
        <section className="space-y-4 [&_h2]:font-semibold [&_h2]:text-xl [&_p]:leading-7">
          <ReactMarkdown>{article.body}</ReactMarkdown>
        </section>
      ) : (
        article.sections?.map((section) => (
          <section className="space-y-4" key={section.heading}>
            <h2 className="font-semibold text-xl">{section.heading}</h2>
            {section.paragraphs.map((p) => (
              <p className="leading-7" key={p}>
                {p}
              </p>
            ))}
          </section>
        ))
      )}
      {article.sources?.map((source) => (
        <p key={source.url}>
          Further reading:{" "}
          <a className="underline" href={source.url}>
            {source.title}
          </a>
        </p>
      ))}
      {Boolean(content.relatedLinks?.length) && (
        <section aria-labelledby="related-links" className="space-y-4">
          <h2 className="font-semibold text-xl" id="related-links">
            Related products and reading
          </h2>
          <ul className="space-y-2">
            {content.relatedLinks?.map((link) => (
              <li key={link.url}>
                <a className="underline" href={link.url}>
                  {link.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link className="underline" href={section.href}>
        More from {section.title}
      </Link>
    </article>
  );
}
