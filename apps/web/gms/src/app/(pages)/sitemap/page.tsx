import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import Link from "next/link";
import { NAV_SECTIONS, sectionLinks } from "@/lib/nav-sections";
export const metadata = { title: "Sitemap" };
export default function SitemapPage() {
  return (
    <div className="space-y-8">
      <h1 className="font-bold text-3xl">Explore the GMS website</h1>
      {NAV_SECTIONS.map((section) => (
        <section className="space-y-3" key={section.label}>
          <h2 className="font-semibold text-xl">{section.label}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {sectionLinks(section).map((link) => (
              <li key={link.href}>
                <Link className="underline" href={link.href}>
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">Bulletins</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(BULLETIN_CATEGORIES).map(([key, label]) => (
            <li key={key}>
              <Link className="underline" href={`/bulletins/${key}`}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
