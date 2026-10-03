"use client";

import {
  HouseIcon,
  MenuIcon,
  RadarIcon,
  TriangleAlertIcon,
  WavesIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type AlertsResult, alertsLevel, alertsSummary } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

const TABS = [
  { href: "/", label: "Today", Icon: HouseIcon },
  { href: "/weather/radar", label: "Radar", Icon: RadarIcon },
  { href: "/alerts", label: "Alerts", Icon: TriangleAlertIcon },
  { href: "/marine", label: "Marine", Icon: WavesIcon },
] as const;

const TAB =
  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 font-semibold text-caption leading-caption outline-none focus-visible:ring-2 focus-visible:ring-gm-lime focus-visible:ring-inset";

function isCurrent(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Bottom tab bar on phones: the four things people open most, plus the menu.
 * Reserved for the GMS app; the website does not mount it (the header's menu
 * button opens the drawer on phones).
 * The Warnings tab carries a level dot when anything is in effect; the dot
 * always has the status wording beside it for screen readers.
 */
export function MobileTabBar({
  alerts,
  onOpenMenu,
}: {
  alerts: AlertsResult;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const level = alertsLevel(alerts);

  return (
    <nav
      aria-label="Quick links"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 bg-gm-navy pb-[env(safe-area-inset-bottom)] text-gm-text-inverse/80 lg:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={cn(TAB, current && "text-gm-lime")}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
            {href === "/alerts" && level !== "none" && (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-2 left-[calc(50%+6px)] size-2.5 rounded-full ring-2 ring-gm-navy",
                    WARNING_LEVEL_SURFACE[level]
                  )}
                />
                <span className="sr-only">: {alertsSummary(alerts)}</span>
              </>
            )}
          </Link>
        );
      })}
      <button className={TAB} onClick={onOpenMenu} type="button">
        <MenuIcon aria-hidden="true" className="size-5" />
        Menu
      </button>
    </nav>
  );
}
