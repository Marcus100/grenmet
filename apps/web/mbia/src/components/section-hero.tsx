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
            className="font-semibold text-gaa-gold text-xs uppercase tracking-[0.2em] hover:text-white"
            href={eyebrowHref}
          >
            {eyebrow}
          </Link>
        ) : (
          <p className="font-semibold text-gaa-gold text-xs uppercase tracking-[0.2em]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 max-w-3xl font-bold font-display text-3xl leading-tight sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        {dek ? (
          <p className="mt-4 max-w-2xl text-base text-white/75 leading-relaxed sm:text-lg">
            {dek}
          </p>
        ) : null}
        <div className="mt-8 h-1 w-24 rounded-full bg-gaa-gold" />
      </div>
    </div>
  );
}
