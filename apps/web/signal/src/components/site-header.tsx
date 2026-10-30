import { AccountButton } from "@barrelsgd/ui/components/account-button";
import Link from "next/link";
import { NAV_LINKS } from "@/lib/nav";

/** `accountLabel` shows "Sign in" with the Barrels account (ADR-0017). */
export function SiteHeader({ accountLabel }: { accountLabel?: string }) {
  return (
    <header className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="border-signal-rule flex flex-wrap justify-between gap-x-6 gap-y-2 border-b py-3 text-sm">
        <p>Grenada, Carriacou & Petite Martinique</p>
        <div className="flex items-center gap-4">
          <Link className="text-signal-green hover:underline" href="/about">
            At home. Away. Connected.
          </Link>
          {accountLabel ? <AccountButton appLabel={accountLabel} /> : null}
        </div>
      </div>
      <div className="py-8 text-center sm:py-10">
        <Link
          aria-label="Grenada Signal — home"
          className="inline-block font-serif text-4xl leading-none font-semibold tracking-tight sm:text-6xl lg:text-7xl"
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
        className="border-signal-ink flex flex-wrap justify-center gap-x-6 border-y py-1"
      >
        {NAV_LINKS.map((link) => (
          <Link
            className="hover:text-signal-green inline-flex min-h-11 items-center py-2 text-base font-medium hover:underline"
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
