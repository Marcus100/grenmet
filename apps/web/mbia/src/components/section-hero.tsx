import type { Route } from "next";
import Link from "next/link";

/**
 * Shared interior-page hero: navy band, gold runway rule, eyebrow trail.
 * Keeps every non-homepage page on the same visual system.
 */
export function SectionHero({
  eyebrow,
  eyebrowHref,
  title,
  dek,
}: {
  eyebrow: string;
  eyebrowHref?: string;
  title: string;
  dek?: string;
}) {
  return (
    <div className="bg-gaa-navy-ink text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8 lg:py-20">
        {eyebrowHref ? (
          <Link
            className="text-gaa-gold text-xs font-semibold tracking-[0.2em] uppercase hover:text-white"
            href={eyebrowHref as Route}
          >
            {eyebrow}
          </Link>
        ) : (
          <p className="text-gaa-gold text-xs font-semibold tracking-[0.2em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display mt-3 max-w-3xl text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        {dek ? (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
            {dek}
          </p>
        ) : null}
        <div className="bg-gaa-gold mt-8 h-1 w-24 rounded-full" />
      </div>
    </div>
  );
}
