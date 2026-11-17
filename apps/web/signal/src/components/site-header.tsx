import Link from "next/link";
import { AccountSlot } from "@/components/account-slot";
import { NAV_LINKS } from "@/lib/nav";

/**
 * Only the primary section links prefetch on load. The rest of the masthead
 * (and every card, list and footer link) waits for a click, which keeps the
 * home page from requesting about 25 route payloads up front.
 */
const PRIMARY_NAV_HREFS: ReadonlySet<string> = new Set([
  "/news-community",
  "/culture-life",
  "/sport",
]);

/** `accountLabel` shows "Sign in" with the Barrels account (ADR-0017). */
export function SiteHeader({ accountLabel }: { accountLabel?: string }) {
  return (
    <header className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="border-signal-rule flex flex-wrap justify-between gap-x-6 gap-y-2 border-b py-3 text-sm">
        <p>Grenada, Carriacou & Petite Martinique</p>
        <div className="flex items-center gap-4">
          <Link
            className="text-signal-green hover:underline"
            href="/about"
            prefetch={false}
          >
            At home. Away. Connected.
          </Link>
          {accountLabel ? <AccountSlot appLabel={accountLabel} /> : null}
        </div>
      </div>
      <div className="py-8 text-center sm:py-10">
        <Link
          aria-label="Grenada Signal — home"
          className="inline-block font-serif text-4xl leading-none font-semibold tracking-tight sm:text-6xl lg:text-7xl"
          href="/"
          prefetch={false}
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
            prefetch={PRIMARY_NAV_HREFS.has(link.href)}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
