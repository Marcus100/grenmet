import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import Link from "next/link";
import { groupId, NAV_SECTIONS, sectionId } from "@/lib/nav-sections";
export const metadata = { title: "Sitemap" };
export default function SitemapPage() {
  return (
    <div className="space-y-8 pt-3 text-body-base text-gm-text-primary leading-body-base lg:pt-4">
      <h1 className="font-bold text-gm-navy text-heading-md leading-heading-md">
        Explore the GMS website
      </h1>
      {NAV_SECTIONS.map((section) => (
        <section
          className="scroll-mt-24 space-y-3"
          id={sectionId(section.label)}
          key={section.label}
        >
          <h2 className="font-bold text-gm-navy text-heading-sm leading-heading-sm">
            {section.label}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {section.groups.map((group) => (
              <div
                className="scroll-mt-24 space-y-2"
                id={groupId(section.label, group.heading)}
                key={group.heading}
              >
                <h3 className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wide">
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
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="font-bold text-gm-navy text-heading-sm leading-heading-sm">
          Bulletins
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(BULLETIN_CATEGORIES).map(([key, label]) => (
            <li key={key}>
              <Link
                className="text-gm-blue-ink underline"
                href={`/bulletins/${key}`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
