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
      <header
        className="sticky top-0 z-40 flex h-header items-center gap-8 border-gm-border border-b bg-background pr-5 pl-6 lg:gap-12 lg:px-10"
        ref={headerRef}
      >
        <Image
          alt="Grenada Meteorological Service"
          height={36}
          priority
          src="/gmslogos/logo-primary-navy.png"
          width={150}
        />

        <DesktopNav alerts={alerts} anchor={headerRef} />

        <div className="ml-auto flex items-center">
          <Link
            className="hidden h-11 items-center gap-2.5 rounded-md bg-gm-risk-yellow px-5 font-semibold text-body-base text-gm-text-primary leading-body-base hover:bg-gm-sun lg:flex"
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
      </header>

      <NavDrawer onClose={() => setNavOpen(false)} open={navOpen} />
    </>
  );
}
