"use client";

import { Menu, TriangleAlertIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { DesktopNav } from "@/components/desktop-nav";
import { NavDrawer } from "@/components/nav-drawer";
import type { AlertsResult } from "@/lib/cap";

interface HeaderProps {
  alerts: AlertsResult;
}

export function Header({ alerts }: HeaderProps) {
  const [navOpen, setNavOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  return (
    <>
      {/* The bar is full-bleed so the border spans the viewport, but its
          contents sit in the same container as the page below it. */}
      <header
        className="sticky top-0 z-40 border-gm-border border-b bg-background"
        ref={headerRef}
      >
        <div className="flex h-header items-center gap-6 px-4 sm:px-6 lg:px-6 xl:gap-8">
          {/* shrink-0: the flex row takes the logo's width first otherwise, and
            the lockup vanishes entirely between 1024px and 1200px. */}
          <Link
            aria-label="Grenada Meteorological Service — home"
            className="shrink-0"
            href="/"
          >
            <Image
              alt="Grenada Meteorological Service"
              height={36}
              priority
              src="/gmslogos/logo-primary-navy.png"
              width={150}
            />
          </Link>

          {/* Logo and the alerts pill hold the viewport edges; the nav itself
            sits in the content column between them. */}
          <div className="flex max-w-7xl flex-1 justify-center">
            <DesktopNav alerts={alerts} anchor={headerRef} />
          </div>

          <div className="flex shrink-0 items-center">
            <Link
              className="hidden h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md bg-gm-risk-yellow px-4 font-semibold text-body-base text-gm-text-primary leading-body-base hover:bg-gm-sun lg:flex"
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
