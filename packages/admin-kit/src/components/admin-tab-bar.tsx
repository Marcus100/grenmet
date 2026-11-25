"use client";

import { useSidebar } from "@barrelsgd/ui/components/ui/sidebar";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Ellipsis } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type AdminNavGroup,
  getActiveIds,
  getTabItems,
} from "../lib/navigation";

/** Height of the bar, for the page's bottom padding (`pb-[…]`). */
export const TAB_BAR_CLEARANCE = "calc(4.5rem+env(safe-area-inset-bottom))";

const TAB =
  "flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [&_svg]:size-5";

/**
 * The phone bottom tab bar: the navigation items flagged `tab: true` (at most
 * four) and "More", which opens the sidebar sheet with everything else. Phones
 * only; it sits above the safe-area inset. Render it inside the sidebar
 * provider (AdminShell does).
 */
export function AdminTabBar({
  navigation,
}: {
  readonly navigation: readonly AdminNavGroup[];
}) {
  const pathname = usePathname();
  const { setOpenMobile, openMobile } = useSidebar();
  const tabs = getTabItems(navigation);

  if (tabs.length === 0) {
    return null;
  }

  const activeIds = getActiveIds(navigation, pathname);
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const moreActive = [...activeIds].some((id) => !tabIds.has(id));
  const anyTabActive = tabs.some((tab) => activeIds.has(tab.id));

  return (
    <nav
      aria-label="Main"
      className="border-border bg-background fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      data-slot="admin-tab-bar"
    >
      <ul className="flex gap-1 px-2 py-1">
        {tabs.map((tab) => {
          const active = activeIds.has(tab.id);
          return (
            <li className="flex flex-1" key={tab.id}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  TAB,
                  "w-full",
                  active ? "text-primary bg-muted" : "text-foreground"
                )}
                href={tab.url as Route}
              >
                <span className="relative">
                  {tab.icon}
                  {tab.badge !== undefined && tab.badge !== 0 ? (
                    <span
                      aria-hidden="true"
                      className="bg-primary text-primary-foreground absolute -top-1.5 -right-3 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold capitalize"
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </span>
                {tab.title}
                {tab.badge !== undefined && tab.badge !== 0 ? (
                  <span className="sr-only">
                    {tab.badgeLabel ? `(${tab.badgeLabel})` : `(${tab.badge})`}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button
            aria-expanded={openMobile}
            aria-haspopup="dialog"
            className={cn(
              TAB,
              "w-full",
              moreActive && !anyTabActive
                ? "text-primary bg-muted"
                : "text-foreground"
            )}
            onClick={() => setOpenMobile(true)}
            type="button"
          >
            <Ellipsis aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
