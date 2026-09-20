"use client";

import { Logo } from "@barrelsgd/gms/components/logo";
import { Menu, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { DesktopNav } from "@/components/desktop-nav";
import { NavDrawer } from "@/components/nav-drawer";
import { type AlertsResult, alertsLevel } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

interface HeaderProps {
  alerts: AlertsResult;
}

export function Header({ alerts }: HeaderProps) {
  const [navOpen, setNavOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const level = alertsLevel(alerts);

  return (
    <>
      {/* The bar is full-bleed so the border spans the viewport, but its
          contents sit in the same container as the page below it. */}
      <header
        className="sticky top-0 z-40 border-gm-border border-b bg-background"
        ref={headerRef}
      >
        <div className="mx-auto flex h-header max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-6 xl:gap-8 xl:px-8">
          {/* shrink-0: the flex row takes the logo's width first otherwise, and
            the lockup vanishes entirely between 1024px and 1200px. */}
          <Link
            aria-label="Grenada Meteorological Service — home"
            className="shrink-0"
            href="/"
          >
            <Logo className="h-9 w-auto" priority variant="primary" />
          </Link>

          {/* Row is capped at max-w-6xl so logo/nav/alerts share the same
            content column as the page below; the nav itself fills the space
            between logo and alerts pill. */}
          <div className="flex flex-1 justify-center">
            <DesktopNav alerts={alerts} anchor={headerRef} />
          </div>

          <div className="flex shrink-0 items-center">
            <Link
              className={cn(
                "hidden h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-4 font-semibold text-body-base leading-body-base lg:flex",
                WARNING_LEVEL_SURFACE[level]
              )}
              href="/warnings"
            >
              <TriangleAlertIcon
                aria-hidden="true"
                className="size-5"
                strokeWidth={2}
              />
              Current alerts
            </Link>

            <button
              aria-label="Open navigation"
              className="flex size-11 items-center justify-center lg:hidden"
              onClick={() => setNavOpen(true)}
              type="button"
            >
              <Menu className="size-6 text-gm-text-primary" />
            </button>
          </div>
        </div>
      </header>

      <NavDrawer onClose={() => setNavOpen(false)} open={navOpen} />
    </>
  );
}
