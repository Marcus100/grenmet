import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export function PageCard({
  href,
  title,
  dek,
  meta,
}: {
  href: string;
  title: string;
  dek: string;
  meta?: string;
}) {
  return (
    <Link
      className="group border-gaa-rule hover:border-gaa-sea/40 flex flex-col rounded-2xl border bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
      href={href as Route}
    >
      {meta ? (
        <p className="text-gaa-sea mb-2 text-xs font-medium tracking-wider uppercase">
          {meta}
        </p>
      ) : null}
      <h3 className="font-display text-gaa-navy text-lg leading-snug font-semibold">
        {title}
      </h3>
      <p className="text-gaa-muted mt-2 line-clamp-3 flex-1 text-sm leading-relaxed">
        {dek}
      </p>
      <span className="text-gaa-sea mt-4 flex items-center gap-1.5 text-sm font-medium">
        Read more
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
