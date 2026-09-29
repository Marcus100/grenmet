import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { groupId, NAV_SECTIONS, sectionId } from "@/lib/nav-sections";

export const metadata = { title: "Sitemap" };

const SECTION_HEADING =
  "font-bold font-gm-display text-gm-heading text-heading-md leading-heading-md";

export default function SitemapPage() {
  return (
    <div className="text-body-base text-gm-text-primary leading-body-base">
      <PageHeader
        description="Every page on the site, by section."
        title="Explore the GMS website"
      />
      <div className="space-y-10">
        {NAV_SECTIONS.map((section) => (
          <section
            className="scroll-mt-24 space-y-3 border-gm-border border-t pt-5"
            id={sectionId(section.label)}
            key={section.label}
          >
            <h2 className={SECTION_HEADING}>
              <Link className="hover:underline" href={section.href}>
                {section.label}
              </Link>
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {section.groups.map((group) => (
                <div
                  className="scroll-mt-24 space-y-2"
                  id={groupId(section.label, group.heading)}
                  key={group.heading}
                >
                  <h3 className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
                    {group.heading}
                  </h3>
                  <ul className="space-y-1.5">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          className="text-gm-blue-ink underline"
                          href={link.href}
                        >
                          {link.name}
                        </Link>
                        {link.planned && (
                          <span className="ml-2 text-body-sm text-gm-text-muted leading-body-sm">
                            coming soon
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
        <section className="space-y-3 border-gm-border border-t pt-5">
          <h2 className={SECTION_HEADING}>Bulletins</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(BULLETIN_CATEGORIES).map(([key, label]) => (
              <li key={key}>
                <Link
                  className="text-gm-blue-ink underline"
                  href={`/alerts/bulletins/${key}`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
