import { Button } from "@barrelsgd/ui/components/ui/button";
import { ChevronDownIcon, Mail, Phone, PlaneTakeoff } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccountSlot } from "@/components/account-slot";
import { MobileNavToggle } from "@/components/mobile-nav-toggle";
import { NavMenuDismiss } from "@/components/nav-menu-dismiss";
import { NAV_GROUPS } from "@/lib/nav";

function UtilityBar() {
  return (
    <div className="hidden bg-gaa-navy-deep text-white/85 md:block">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-4 text-xs lg:px-8">
        <div className="flex items-center gap-5">
          <a
            className="flex items-center gap-1.5 transition-colors hover:text-white"
            href="tel:+14734444555"
          >
            <Phone aria-hidden="true" className="size-3" />
            +1 (473) 444-4555
          </a>
          <a
            className="flex items-center gap-1.5 transition-colors hover:text-white"
            href="mailto:gaa@gaa.gd"
          >
            <Mail aria-hidden="true" className="size-3" />
            gaa@gaa.gd
          </a>
        </div>
        <div className="flex items-center gap-5">
          <Link
            className="transition-colors hover:text-white"
            data-analytics-event="navigation_category_selected"
            href="/corporate/careers-opportunities"
          >
            Careers
          </Link>
          <Link className="transition-colors hover:text-white" href="/news">
            News
          </Link>
          <Link className="transition-colors hover:text-white" href="/contact">
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Desktop mega-menu as native disclosures: `<summary>` gives keyboard
 * (Enter/Space) and screen-reader expanded state for free. `name` makes the
 * groups exclusive where the browser supports it; `NavMenuDismiss` covers
 * outside clicks, Escape and link clicks everywhere else.
 */
function DesktopNav() {
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center justify-center">
        {NAV_GROUPS.map((group) => (
          <li className="relative" key={group.label}>
            <details className="group" data-site-nav="" name="site-nav">
              <summary className="inline-flex h-9 w-max cursor-pointer list-none items-center justify-center rounded-lg px-2.5 py-1.5 font-medium text-sm outline-none transition-all hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 group-open:bg-muted/50 [&::-webkit-details-marker]:hidden">
                {group.label}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="relative top-px ml-1 size-3 transition duration-300 group-open:rotate-180"
                />
              </summary>
              <div className="absolute top-full left-0 z-50 mt-2 rounded-lg bg-popover text-popover-foreground shadow ring-1 ring-foreground/10">
                <div className="grid w-[420px] grid-cols-2 gap-1 p-3">
                  <Link
                    className="col-span-2 rounded-lg bg-gaa-mist p-3 font-display font-semibold text-gaa-navy text-sm hover:bg-gaa-rule"
                    href={group.href as Route}
                  >
                    {group.label} overview →
                  </Link>
                  {group.links.map((link) => (
                    <Link
                      className="rounded-lg p-2.5 text-gaa-ink text-sm hover:bg-gaa-mist hover:text-gaa-navy"
                      href={link.href as Route}
                      key={link.href}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <NavMenuDismiss />
    </nav>
  );
}

/** `accountLabel` shows "Sign in" with the Barrels account (ADR-0017). */
export function SiteHeader({ accountLabel }: { accountLabel?: string }) {
  return (
    <header className="sticky top-0 z-50 border-gaa-rule border-b bg-white/95 backdrop-blur">
      <UtilityBar />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        <Link className="flex shrink-0 items-center" href="/">
          <Image
            alt="Grenada Airports Authority"
            className="h-10 w-auto"
            height={40}
            preload
            src="/images/gaa-logo-blue.png"
            width={78}
          />
          <span className="sr-only">Grenada Airports Authority — home</span>
        </Link>
        <DesktopNav />
        <div className="flex items-center gap-2">
          {accountLabel ? <AccountSlot appLabel={accountLabel} /> : null}
          <Button
            asChild
            className="hidden bg-gaa-gold font-semibold text-gaa-navy-ink hover:bg-gaa-gold-deep sm:inline-flex"
          >
            <Link href="/flights">
              <PlaneTakeoff aria-hidden="true" className="size-4" />
              Flight Info
            </Link>
          </Button>
          <MobileNavToggle />
        </div>
      </div>
    </header>
  );
}
