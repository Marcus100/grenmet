import Link from "next/link";
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
      <header className="space-y-2">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="max-w-3xl text-muted-foreground">{description}</p>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {sections.map((section) => (
          <section
            className="space-y-4 rounded-xl border bg-card p-5"
            key={section.title}
          >
            <h2 className="font-semibold text-lg">{section.title}</h2>
            <p>{section.body}</p>
            <ul className="space-y-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link className="text-primary underline" href={link.href}>
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
