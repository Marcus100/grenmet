import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { NAV_SECTIONS } from "@/lib/nav-sections";

/**
 * Landing page for a navigation section that has no hand-built index: the
 * section's blurb, then each menu group as a list of onward links. Planned
 * pages are listed too — they open a clearly marked placeholder.
 */
export function SectionIndex({ href }: { href: string }) {
  const section = NAV_SECTIONS.find((entry) => entry.href === href);
  if (!section) {
    notFound();
  }
  return (
    <>
      <PageHeader description={section.blurb} title={section.label} />
      {section.groups.map((group) => (
        <PageSection heading={group.heading} key={group.heading}>
          <LinkList
            links={group.links.map((link) => ({
              name: link.name,
              href: link.href,
              description: link.description,
              meta: link.planned ? "Coming soon" : undefined,
            }))}
          />
        </PageSection>
      ))}
    </>
  );
}
