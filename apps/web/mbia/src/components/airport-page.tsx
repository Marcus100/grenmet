import { Button } from "@barrelsgd/ui/components/ui/button";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export interface AirportFact {
  label: string;
  value: string;
}

/**
 * Shared template for the three airport pages: full-width photo hero,
 * signage-style facts strip, prose body, and task links.
 */
export function AirportPage({
  eyebrow,
  name,
  tagline,
  image,
  imageAlt,
  facts,
  links,
  children,
}: {
  eyebrow: string;
  name: string;
  tagline: string;
  image: string;
  imageAlt: string;
  facts: AirportFact[];
  links: { label: string; href: string }[];
  children: ReactNode;
}) {
  return (
    <>
      <div className="bg-gaa-navy-ink relative isolate overflow-hidden">
        <Image
          alt={imageAlt}
          className="absolute inset-0 size-full object-cover"
          fill
          preload
          sizes="100vw"
          src={image}
        />
        <div className="from-gaa-navy-ink via-gaa-navy-ink/55 to-gaa-navy-ink/15 absolute inset-0 bg-linear-to-t" />
        <div className="relative mx-auto flex min-h-[52vh] max-w-7xl flex-col justify-end px-4 pt-28 pb-14 lg:px-8">
          <p className="text-gaa-gold text-xs font-semibold tracking-[0.25em] uppercase">
            {eyebrow}
          </p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl">
            {name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">{tagline}</p>
        </div>
      </div>

      <div className="border-gaa-rule bg-gaa-navy border-b text-white">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-x-8 gap-y-4 px-4 py-6 sm:grid-cols-4 lg:px-8">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs tracking-wider text-white/60 uppercase">
                {fact.label}
              </dt>
              <dd className="tabular font-display mt-1 text-lg font-semibold">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 lg:grid-cols-[1fr_300px] lg:px-8">
        <div className="prose prose-slate prose-headings:font-display prose-a:text-gaa-sea prose-headings:text-gaa-navy max-w-none">
          {children}
        </div>
        <aside aria-label="Airport quick links">
          <div className="border-gaa-rule bg-gaa-mist rounded-2xl border p-6">
            <p className="text-gaa-navy text-sm font-semibold">
              Plan your journey
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {links.map((link) => (
                <Button
                  asChild
                  className="text-gaa-navy hover:bg-gaa-rule justify-start bg-white"
                  key={link.href}
                  variant="secondary"
                >
                  <Link href={link.href as Route}>{link.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
