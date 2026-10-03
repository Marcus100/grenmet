import Link from "next/link";
import { NAV_LINKS } from "@/lib/nav";

export function SiteHeader() {
  return (
    <header className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-signal-rule border-b py-3 text-sm">
        <p>Grenada, Carriacou & Petite Martinique</p>
        <Link className="text-signal-green hover:underline" href="/about">
          At home. Away. Connected.
        </Link>
      </div>
      <div className="py-8 text-center sm:py-10">
        <Link
          aria-label="Grenada Signal — home"
          className="inline-block font-semibold font-serif text-4xl leading-none tracking-tight sm:text-6xl lg:text-7xl"
          href="/"
        >
          Grenada{" "}
          <span className="text-signal-green">
            Signal<span className="text-signal-ink">.</span>
          </span>
        </Link>
        <p className="mt-4 text-base">
          News, culture and what’s worth your time. From Grenada, looking out.
        </p>
      </div>
      <nav
        aria-label="Main navigation"
        className="flex flex-wrap justify-center gap-x-6 border-signal-ink border-y py-1"
      >
        {NAV_LINKS.map((link) => (
          <Link
            className="inline-flex min-h-11 items-center py-2 font-medium text-base hover:text-signal-green hover:underline"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
