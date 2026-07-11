import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageCard } from "@/components/page-card";
import { SectionHero } from "@/components/section-hero";
import { getNews, getSectionPages } from "@/lib/content";
import { formatDate } from "@/lib/content-utils";
import {
  SECTION_DESCRIPTIONS,
  SECTION_LABELS,
  SECTIONS,
  type Section,
} from "@/lib/nav";

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  if (!isSection(section)) {
    return {};
  }
  return {
    title: SECTION_LABELS[section],
    description: SECTION_DESCRIPTIONS[section],
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSection(section)) {
    notFound();
  }
  const pages = section === "news" ? getNews() : getSectionPages(section);

  return (
    <>
      <SectionHero
        dek={SECTION_DESCRIPTIONS[section]}
        eyebrow="Grenada Airports Authority"
        title={SECTION_LABELS[section]}
      />
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <PageCard
              dek={page.dek}
              href={`/${section}/${page.slug}`}
              key={page.slug}
              meta={
                section === "news" ? formatDate(page.publishedAt) : undefined
              }
              title={page.title}
            />
          ))}
        </div>
        {pages.length === 0 && (
          <p className="py-16 text-center text-gaa-muted">
            Content for this section is on its way.
          </p>
        )}
      </div>
    </>
  );
}
