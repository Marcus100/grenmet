import { ArrowRight } from "lucide-react";
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
      className="group flex flex-col rounded-2xl border border-gaa-rule bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-gaa-sea/40 hover:shadow-lg"
      href={href}
    >
      {meta ? (
        <p className="mb-2 font-medium text-gaa-sea text-xs uppercase tracking-wider">
          {meta}
        </p>
      ) : null}
      <h3 className="font-display font-semibold text-gaa-navy text-lg leading-snug">
        {title}
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 text-gaa-muted text-sm leading-relaxed">
        {dek}
      </p>
      <span className="mt-4 flex items-center gap-1.5 font-medium text-gaa-sea text-sm">
        Read more
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
