import { allPages } from "content-collections";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MdxContent } from "@/components/mdx-content";
import { SectionHero } from "@/components/section-hero";
import { getPage, getSectionPages } from "@/lib/content";
import { formatDate } from "@/lib/content-utils";
import { SECTION_LABELS, SECTIONS, type Section } from "@/lib/nav";

export function generateStaticParams() {
  return allPages
    .filter((page) => !page.draft)
    .map((page) => ({ section: page.section, slug: page.slug }));
}

function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}): Promise<Metadata> {
  const { section, slug } = await params;
  if (!isSection(section)) {
    return {};
  }
  const page = getPage(section, slug);
  if (!page) {
    return {};
  }
  return { title: page.title, description: page.dek };
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}) {
  const { section, slug } = await params;
  if (!isSection(section)) {
    notFound();
  }
  const page = getPage(section, slug);
  if (!page) {
    notFound();
  }
  const related = getSectionPages(section)
    .filter((p) => p.slug !== slug)
    .slice(0, 4);

  return (
    <>
      <SectionHero
        dek={section === "news" ? formatDate(page.publishedAt) : page.dek}
        eyebrow={SECTION_LABELS[section]}
        eyebrowHref={`/${section}`}
        title={page.title}
      />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 lg:grid-cols-[1fr_280px] lg:px-8">
        <article className="prose prose-slate prose-headings:font-display prose-a:text-gaa-sea prose-headings:text-gaa-navy prose-strong:text-gaa-ink max-w-none">
          <MdxContent code={page.body} />
        </article>
        {related.length > 0 && (
          <aside aria-label="Related pages">
            <p className="text-gaa-muted text-xs font-semibold tracking-[0.2em] uppercase">
              More in {SECTION_LABELS[section]}
            </p>
            <ul className="border-gaa-rule mt-4 space-y-1 border-l">
              {related.map((p) => (
                <li key={p.slug}>
                  <Link
                    className="text-gaa-muted hover:text-gaa-navy block px-4 py-2 text-sm transition-colors"
                    href={`/${section}/${p.slug}`}
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </>
  );
}
