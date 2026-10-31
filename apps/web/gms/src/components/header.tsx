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
import {
  CheckingStatusPill,
  WarningStatusPill,
} from "@/components/warning-status-pill";
import {
  type AlertsSource,
  type GreenSource,
  WithAlerts,
  WithStatus,
} from "@/components/with-alerts";
import { cn } from "@/lib/utils";

interface HeaderProps {
  /** Shows "Sign in" with the Barrels account (ADR-0017) when configured. */
  accountLabel?: string;
  /** The warning feed; a promise streams in without holding up the page. */
  alerts: AlertsSource;
  /** The GMS outlook's Green counts, read separately so warnings never wait on it. */
  green: GreenSource;
  /** Shows "Sign in" (WEATHER_SHOW_SIGN_IN). Hidden unless the switch is on. */
  showSignIn?: boolean;
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
export function Header({
  accountLabel,
  alerts,
  green,
  showSignIn = false,
}: HeaderProps) {
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
      {/* No ribbon while checking: it only appears for a warning or an
          outage, and saying either before the feed answers would be wrong. */}
      <WithAlerts alerts={alerts} fallback={null}>
        {(result) => <WarningRibbon alerts={result} />}
      </WithAlerts>
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
            <WithStatus
              alerts={alerts}
              fallback={<CheckingStatusPill className="flex h-7 xl:hidden" />}
              green={green}
            >
              {(result, outlook) => (
                <WarningStatusPill
                  alerts={result}
                  className="flex h-7 xl:hidden"
                  green={outlook}
                />
              )}
            </WithStatus>
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
          </div>
        </div>

        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 xl:px-8">
          {/* The `dark` scope inks the GMS monogram white on navy. */}
          <Link
            aria-label="Grenada Meteorological Service — home"
            className="dark shrink-0"
            href="/"
          >
            <Logo className="h-9 w-auto" variant="monogram" />
          </Link>

          <div className="flex min-w-0 flex-1 justify-center">
            <DesktopNav alerts={alerts} anchor={headerRef} green={green} />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <SiteSearch />
            <ThemeToggle />
            {showSignIn && accountLabel ? (
              // The `dark` scope gives the outline button navy-safe tokens.
              // Phones and tablets sign in from the drawer instead.
              <div className="dark hidden lg:block">
                <AccountButton appLabel={accountLabel} />
              </div>
            ) : null}
            <WithStatus
              alerts={alerts}
              fallback={
                <CheckingStatusPill className="flex lg:hidden xl:flex" />
              }
              green={green}
            >
              {(result, outlook) => (
                <WarningStatusPill
                  alerts={result}
                  className="flex lg:hidden xl:flex"
                  green={outlook}
                />
              )}
            </WithStatus>
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
        accountLabel={accountLabel}
        alerts={alerts}
        green={green}
        onClose={() => setNavOpen(false)}
        open={navOpen}
        showSignIn={showSignIn}
        top={menuTop}
      />
    </>
  );
}
