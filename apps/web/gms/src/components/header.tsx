"use client";

import { Logo } from "@barrelsgd/gms/components/logo";
import { AccountButton } from "@barrelsgd/ui/components/account-button";
import { AnchorIcon, BellIcon, PlaneIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { DesktopNav } from "@/components/desktop-nav";
import { NavDrawer } from "@/components/nav-drawer";
import { SiteSearch } from "@/components/site-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { WarningRibbon } from "@/components/warning-ribbon";
import { WarningStatusPill } from "@/components/warning-status-pill";
import type { AlertsResult } from "@/lib/cap";
import { cn } from "@/lib/utils";

interface HeaderProps {
  /** Shows "Sign in" with the Barrels account (ADR-0017) when configured. */
  accountLabel?: string;
  alerts: AlertsResult;
}

const UTILITY_LINKS = [
  { href: "/services/aviation", label: "For pilots", Icon: PlaneIcon },
  { href: "/marine/forecast", label: "For mariners", Icon: AnchorIcon },
  { href: "/alerts/get-alerts", label: "Get alerts", Icon: BellIcon },
] as const;

/**
 * Bold sky masthead: warning ribbon (only when there is something to say),
 * a navy utility bar and main bar, the mega menu, and on mobile the drawer.
 */
export function Header({ alerts, accountLabel }: HeaderProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const headerRef = useRef<HTMLElement>(null);

  /** The menu opens under the header, so the logo and the button never move. */
  function toggleNav() {
    if (!navOpen && headerRef.current)
      setMenuTop(headerRef.current.getBoundingClientRect().bottom);
    setNavOpen((open) => !open);
  }

  return (
    <>
      <WarningRibbon alerts={alerts} />
      <header
        className="sticky top-0 z-40 bg-gm-navy text-gm-text-inverse"
        ref={headerRef}
      >
        <div className="hidden border-gm-text-inverse/15 border-b lg:block">
          <div className="mx-auto flex min-h-9 max-w-6xl items-center gap-5 px-6 text-body-sm text-gm-text-inverse/80 leading-body-sm xl:px-8">
            <span className="mr-auto">
              Official weather service for Grenada, Carriacou and Petite
              Martinique
            </span>
            {/* 1024–1279px: the main bar has no room for the pill, so the
                status sits here instead — it is never hidden. */}
            <WarningStatusPill alerts={alerts} className="flex h-7 xl:hidden" />
            {UTILITY_LINKS.map(({ href, label, Icon }) => (
              <Link
                className="flex items-center gap-1.5 hover:text-gm-text-inverse hover:underline"
                href={href}
                key={href}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            ))}
            <ThemeToggle />
          </div>
        </div>

        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 xl:px-8">
          {/* The `dark` scope swaps the Logo to its white lockup on navy. */}
          <Link
            aria-label="Grenada Meteorological Service — home"
            className="dark shrink-0"
            href="/"
          >
            <Logo className="h-9 w-auto" priority variant="primary" />
          </Link>

          <div className="flex min-w-0 flex-1 justify-center">
            <DesktopNav alerts={alerts} anchor={headerRef} />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <SiteSearch />
            {accountLabel ? (
              // The `dark` scope gives the outline button navy-safe tokens.
              <div className="dark">
                <AccountButton appLabel={accountLabel} />
              </div>
            ) : null}
            <WarningStatusPill
              alerts={alerts}
              className="flex lg:hidden xl:flex"
            />
            <button
              aria-controls="site-menu"
              aria-expanded={navOpen}
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
              className="flex size-11 items-center justify-center rounded-md outline-none hover:bg-gm-text-inverse/10 focus-visible:ring-2 focus-visible:ring-gm-lime lg:hidden"
              onClick={toggleNav}
              type="button"
            >
              {/* Three bars that fold into an X. */}
              <span aria-hidden="true" className="relative block h-3.5 w-6">
                {["top-0", "top-1.5", "top-3"].map((position, bar) => (
                  <span
                    className={cn(
                      "absolute left-0 h-0.5 w-6 rounded-full bg-current transition duration-200 ease-out motion-reduce:transition-none",
                      position,
                      navOpen && bar === 0 && "translate-y-1.5 rotate-45",
                      navOpen && bar === 1 && "scale-x-0 opacity-0",
                      navOpen && bar === 2 && "-translate-y-1.5 -rotate-45"
                    )}
                    key={position}
                  />
                ))}
              </span>
            </button>
          </div>
        </div>
      </header>

      <NavDrawer
        alerts={alerts}
        onClose={() => setNavOpen(false)}
        open={navOpen}
        top={menuTop}
      />
    </>
  );
}
