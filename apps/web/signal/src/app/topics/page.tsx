import Link from "next/link";
import { PageIntro } from "@/components/editorial";
import { getCurrentArticles } from "@/lib/content";
import { SECTIONS, SERIES } from "@/lib/nav";
export const metadata = { title: "Topics" };
export default function TopicsPage() {
  const articles = getCurrentArticles();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <PageIntro
        eyebrow="Follow your curiosity"
        title="A wider view of island life."
      >
        <p>
          From your parish to the wider world. Find the stories that matter to
          you.
        </p>
      </PageIntro>
      <div className="grid gap-x-10 md:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const count = articles.filter(
            (article) => article.section === section.slug
          ).length;
          return (
            <section
              className="border-signal-rule border-t py-8"
              key={section.slug}
            >
              <h2 className="font-semibold font-serif text-2xl">
                <Link
                  className="hover:text-signal-green hover:underline"
                  href={`/${section.slug}`}
                >
                  {section.label} →
                </Link>
              </h2>
              <p className="mt-3 text-lg leading-relaxed">
                {section.description}
              </p>
              <p className="mt-4 text-signal-muted text-sm">
                {count ? `${count} sample stories` : "No stories yet"}
              </p>
            </section>
          );
        })}
      </div>
      <section className="mt-8 border-signal-ink border-t-2 pt-6">
        <h2 className="font-serif text-3xl">
          Familiar voices. Different perspectives.
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {SERIES.map((series) => (
            <div key={series.label}>
              <h3 className="font-semibold font-serif text-2xl">
                <Link
                  className="text-signal-green hover:underline"
                  href={series.href}
                >
                  {series.label} →
                </Link>
              </h3>
              <p className="mt-3 text-lg">{series.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
