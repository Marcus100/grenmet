"use client";

import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
} from "@barrelsgd/ui/components/ui/navigation-menu";
import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import { type AlertsResult, alertsSummary } from "@/lib/cap";

import {
  NAV_SECTIONS,
  type NavFeature,
  type NavSection,
} from "@/lib/nav-sections";
import { weatherIcon } from "@/lib/weather-icons";

interface DesktopNavProps {
  alerts: AlertsResult;
  /** The masthead; the open panel is centered below it with a capped width. */
  anchor: RefObject<HTMLElement | null>;
}

// nowrap plus a smaller step below xl: at 1024 the six labels, the logo and
// the alerts pill need ~1237px on one line, which simply is not there.
const TOP_LEVEL =
  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 font-semibold text-body-base text-gm-text-primary leading-body-base underline-offset-6 outline-none hover:text-gm-blue-ink focus-visible:ring-2 focus-visible:ring-gm-blue xl:px-2.5 xl:text-nav xl:leading-nav";

const CARD =
  "flex w-64 flex-none flex-col items-start gap-5 rounded-md border border-gm-border p-6 outline-none hover:bg-gm-surface focus-visible:bg-gm-surface";

function FeaturedCard({
  alerts,
  feature,
}: {
  alerts: AlertsResult;
  feature: NavFeature;
}) {
  if (feature === "alerts") {
    const unavailable = alerts.status === "unavailable";
    return (
      <NavigationMenuPrimitive.Link
        className={CARD}
        render={<Link href="/warnings" />}
      >
        <span className="flex size-11 items-center justify-center rounded-md bg-gm-risk-yellow">
          <TriangleAlertIcon
            aria-hidden="true"
            className="size-6 text-gm-text-primary"
            strokeWidth={1.8}
          />
        </span>
        <span className="flex flex-col gap-1">
          <span className="font-semibold text-body text-gm-text-primary leading-body">
            {alertsSummary(alerts)}
          </span>
          <span className="text-body-sm text-gm-text-secondary leading-body-sm">
            {unavailable
              ? "Warning information cannot be retrieved right now."
              : "Live status for Grenada, Carriacou and Petite Martinique."}
          </span>
        </span>
        <span className="mt-auto flex items-center gap-1.5 font-semibold text-body text-gm-blue-ink leading-body">
          See all warnings
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </span>
      </NavigationMenuPrimitive.Link>
    );
  }

  const Icon = weatherIcon("partly-cloudy");
  return (
    <NavigationMenuPrimitive.Link className={CARD} render={<Link href="/" />}>
      <span className="flex size-11 items-center justify-center rounded-md bg-gm-surface">
        <Icon
          aria-hidden="true"
          className="size-6 text-gm-lime-ink"
          strokeWidth={1.6}
        />
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-body text-gm-text-primary leading-body">
          Issued weather forecasts
        </span>
        <span className="text-body-sm text-gm-text-secondary leading-body-sm">
          Morning, midday and evening reports from the GMS forecast desk.
        </span>
      </span>
      <span className="mt-auto flex items-center gap-1.5 font-semibold text-body text-gm-blue-ink leading-body">
        Today&apos;s forecast
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </span>
    </NavigationMenuPrimitive.Link>
  );
}

function Panel({
  alerts,
  section,
}: {
  alerts: AlertsResult;
  section: NavSection;
}) {
  return (
    <div className="flex items-stretch gap-8 px-10 pt-9 pb-12">
      {section.groups.map((group) => (
        <div className="flex min-w-0 flex-1 flex-col" key={group.heading}>
          <p className="pb-4 font-semibold text-caption text-gm-text-muted uppercase leading-caption tracking-wider">
            {group.heading}
          </p>
          <ul className="flex flex-col gap-4">
            {group.links.map((link) => (
              <li key={link.href}>
                <NavigationMenuPrimitive.Link
                  className="group/link flex flex-col items-start gap-1 outline-none"
                  render={<Link href={link.href} />}
                >
                  <span className="font-medium text-body text-gm-text-primary leading-body group-hover/link:text-gm-blue-ink group-focus-visible/link:text-gm-blue-ink">
                    {link.name}
                  </span>
                  <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                    {link.description}
                  </span>
                </NavigationMenuPrimitive.Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {section.featured && (
        <FeaturedCard alerts={alerts} feature={section.featured} />
      )}
    </div>
  );
}

export function DesktopNav({ alerts, anchor }: DesktopNavProps) {
  return (
    <NavigationMenuPrimitive.Root className="hidden lg:block">
      <NavigationMenuList className="justify-start gap-2">
        {NAV_SECTIONS.map((section) =>
          section.groups.length === 0 ? (
            <NavigationMenuItem key={section.label}>
              <NavigationMenuPrimitive.Link
                className={TOP_LEVEL}
                render={<Link href={section.href ?? "/"} />}
              >
                {section.label}
              </NavigationMenuPrimitive.Link>
            </NavigationMenuItem>
          ) : (
            <NavigationMenuItem key={section.label}>
              <NavigationMenuPrimitive.Trigger
                className={`group/trigger ${TOP_LEVEL} data-popup-open:underline`}
              >
                {section.label}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200 group-data-popup-open/trigger:rotate-180"
                />
              </NavigationMenuPrimitive.Trigger>
              <NavigationMenuContent className="w-(--anchor-width) max-w-6xl p-0">
                <Panel alerts={alerts} section={section} />
              </NavigationMenuContent>
            </NavigationMenuItem>
          )
        )}
      </NavigationMenuList>

      <NavigationMenuPrimitive.Portal>
        <NavigationMenuPrimitive.Positioner
          align="center"
          anchor={anchor}
          className="isolate z-50 h-(--positioner-height) w-(--anchor-width) max-w-6xl transition-[top,left] duration-200 data-instant:transition-none"
          side="bottom"
          sideOffset={0}
        >
          <NavigationMenuPrimitive.Popup className="h-(--popup-height) w-(--popup-width) rounded-b-md border border-gm-border bg-background shadow-card transition-[opacity,height] duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0">
            <NavigationMenuPrimitive.Viewport className="relative size-full overflow-hidden" />
          </NavigationMenuPrimitive.Popup>
        </NavigationMenuPrimitive.Positioner>
      </NavigationMenuPrimitive.Portal>
    </NavigationMenuPrimitive.Root>
  );
}
