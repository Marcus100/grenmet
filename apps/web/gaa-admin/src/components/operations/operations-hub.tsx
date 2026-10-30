import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
export function OperationsHub({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: {
    title: string;
    body: string;
    links: { label: string; href: string }[];
  }[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader description={description} title={title} />
      <div className="grid gap-5 md:grid-cols-2">
        {sections.map((section) => (
          <section
            className="bg-card space-y-4 rounded-xl border p-5"
            key={section.title}
          >
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p>{section.body}</p>
            <ul className="space-y-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    className="text-primary underline"
                    href={link.href as Route}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
