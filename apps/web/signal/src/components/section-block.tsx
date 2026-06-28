import Link from "next/link";

export interface SectionBlockProps {
  action?: { label: string; href: string };
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
      <div className="mb-4 flex items-end justify-between border-signal-ink border-b-2 pb-2">
        <h2 className="font-bold font-serif text-xl tracking-tight">{title}</h2>
        {action ? (
          <Link
            className="font-semibold text-[0.7rem] text-signal-green uppercase tracking-wider hover:text-signal-green-dark"
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
