import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { plannedPage, plannedPaths, sectionLinks } from "@/lib/nav-sections";

/**
 * Pages the navigation promises but that are not built yet (links marked
 * `planned` in NAV_SECTIONS). Each renders the sample-content notice and
 * points to the finished pages in the same section. Only planned paths are
 * generated; any other URL is a 404, and a real route always wins over this
 * catch-all.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return plannedPaths().map((path) => ({
    planned: path.split("/").filter(Boolean),
  }));
}

type Params = Promise<{ planned: string[] }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { planned } = await params;
  const page = plannedPage(`/${planned.join("/")}`);
  return page
    ? { title: page.link.name, description: page.link.description }
    : {};
}

export default async function PlannedPage({ params }: { params: Params }) {
  const { planned } = await params;
  const page = plannedPage(`/${planned.join("/")}`);
  if (!page) {
    notFound();
  }
  const { link, section } = page;
  const related = sectionLinks(section)
    .filter((entry) => !entry.planned)
    .slice(0, 6);

  return (
    <>
      <PageHeader description={link.description} title={link.name} />
      <PlaceholderNotice product={link.name} />
      <PageSection heading={`More from ${section.label}`}>
        <LinkList links={related} />
      </PageSection>
    </>
  );
}
