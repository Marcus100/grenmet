import type { Route } from "next";
import Link from "next/link";

export interface SectionBlockProps {
  action?: { label: string; href: Route };
  children: React.ReactNode;
  id?: string;
  title: string;
}

export function SectionBlock({
  title,
  action,
  children,
  id,
}: SectionBlockProps) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-8" id={id}>
      <div className="border-signal-ink mb-4 flex flex-wrap items-end justify-between gap-4 border-b-2 pb-2">
        <h2 className="font-serif text-xl font-bold tracking-tight">{title}</h2>
        {action ? (
          <Link
            className="text-signal-green hover:text-signal-green-dark text-sm font-semibold tracking-wider uppercase"
            href={action.href}
          >
            {action.label} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
