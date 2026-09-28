"use client";

import { NavigationMenuItem } from "@barrelsgd/ui/components/ui/navigation-menu";
import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RefObject } from "react";
import { type AlertsResult, alertsLevel, alertsSummary } from "@/lib/cap";
import {
  NAV_SECTIONS,
  type NavFeature,
  type NavSection,
} from "@/lib/nav-sections";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

interface DesktopNavProps {
  alerts: AlertsResult;
  /** The masthead; the open menu spans its full width, directly below it. */
  anchor: RefObject<HTMLElement | null>;
}

// On navy: white labels, a 3px lime rule for hover/open, white for the
// current section. nowrap plus tighter padding below xl keeps all seven on
// one line at 1024px.
const TRIGGER =
  "flex h-16 items-center gap-1 whitespace-nowrap border-transparent border-y-3 px-2 font-semibold text-body-base text-gm-text-inverse leading-body-base outline-none hover:border-b-gm-lime focus-visible:ring-2 focus-visible:ring-gm-lime focus-visible:ring-inset data-popup-open:border-b-gm-lime xl:px-3";

const MENU_LINK =
  "block py-1 text-body text-gm-text-inverse/90 leading-body outline-none hover:text-gm-text-inverse hover:underline focus-visible:underline";

function Featured({
  alerts,
  feature,
}: {
  alerts: AlertsResult;
  feature: NavFeature;
}) {
  const card =
    "flex flex-col gap-2 self-start rounded-gm-card bg-gm-navy-panel p-4";
  const eyebrow =
    "font-bold text-gm-text-inverse/75 text-label uppercase leading-label tracking-wider";
  const cta =
    "mt-1 flex items-center gap-1 font-semibold text-body text-gm-lime leading-body hover:underline";

  if (feature.kind === "alerts") {
    const level = alertsLevel(alerts);
    return (
      <div className={card}>
        <span className={eyebrow}>Status now</span>
        <span
          className={cn(
            "w-fit rounded-md px-2.5 py-1 font-bold text-body leading-body",
            WARNING_LEVEL_SURFACE[level]
          )}
        >
          {alertsSummary(alerts)}
        </span>
        <span className="text-body-sm text-gm-text-inverse/80 leading-body-sm">
          {level === "unknown"
            ? "Warning information cannot be retrieved right now. This is not an all-clear."
            : "Live status for Grenada, Carriacou and Petite Martinique."}
        </span>
        <NavigationMenuPrimitive.Link
          className={cta}
          render={<Link href="/warnings" />}
        >
          See warnings in effect
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </NavigationMenuPrimitive.Link>
      </div>
    );
  }

  const content =
    feature.kind === "forecast"
      ? {
          eyebrow: "Official forecast",
          text: "Morning, midday and evening reports from the GMS forecast desk.",
          cta: "Today's forecast",
          href: "/weather",
        }
      : feature;
  return (
    <div className={card}>
      <span className={eyebrow}>{content.eyebrow}</span>
      <span className="text-body text-gm-text-inverse leading-body">
        {content.text}
      </span>
      <NavigationMenuPrimitive.Link
        className={cta}
        render={<Link href={content.href} />}
      >
        {content.cta}
        <ArrowRightIcon aria-hidden="true" className="size-4" />
      </NavigationMenuPrimitive.Link>
    </div>
  );
}

function Panel({
  alerts,
  section,
}: {
  alerts: AlertsResult;
  section: NavSection;
}) {
  // Groups flow into four columns, left to right, like the mockup.
  const columns = [0, 1, 2, 3].map((c) =>
    section.groups.filter((_, i) => i % 4 === c)
  );
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[repeat(4,minmax(0,1fr))_16rem] gap-x-7 gap-y-5 px-6 pt-6 pb-7 xl:px-8">
      <div className="col-span-full flex items-baseline gap-4 border-gm-text-inverse/15 border-b pb-3">
        <h2 className="font-bold font-gm-display text-gm-display text-gm-text-inverse uppercase tracking-wide">
          {section.label}
        </h2>
        <p className="text-body text-gm-text-inverse/80 leading-body">
          {section.blurb}
        </p>
        <NavigationMenuPrimitive.Link
          className="ml-auto flex items-center gap-1 whitespace-nowrap font-semibold text-body text-gm-lime leading-body hover:underline"
          render={<Link href={section.href} />}
        >
          All {section.label.toLowerCase()}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </NavigationMenuPrimitive.Link>
      </div>
      {columns.map((groups, c) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed four-column layout
        <div className="flex flex-col gap-4" key={c}>
          {groups.map((group) => (
            <div key={group.heading}>
              <h3 className="mb-1.5 font-bold text-gm-text-inverse/70 text-label uppercase leading-label tracking-wider">
                {group.heading}
              </h3>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <NavigationMenuPrimitive.Link
                      className={MENU_LINK}
                      render={<Link href={link.href} />}
                    >
                      {link.name}
                    </NavigationMenuPrimitive.Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      <Featured alerts={alerts} feature={section.featured} />
    </div>
  );
}

export function DesktopNav({ alerts, anchor }: DesktopNavProps) {
  const pathname = usePathname();
  return (
    <NavigationMenuPrimitive.Root aria-label="Main" className="hidden lg:block">
      <NavigationMenuPrimitive.List className="flex items-center">
        {NAV_SECTIONS.map((section) => {
          const current =
            pathname === section.href ||
            pathname.startsWith(`${section.href}/`);
          return (
            <NavigationMenuItem key={section.label}>
              <NavigationMenuPrimitive.Trigger
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group/trigger",
                  TRIGGER,
                  current && "border-b-gm-text-inverse"
                )}
              >
                {section.label}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="hidden size-4 transition-transform duration-200 group-data-popup-open/trigger:rotate-180 xl:block"
                />
              </NavigationMenuPrimitive.Trigger>
              <NavigationMenuPrimitive.Content className="w-full">
                <Panel alerts={alerts} section={section} />
              </NavigationMenuPrimitive.Content>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuPrimitive.List>

      <NavigationMenuPrimitive.Portal>
        <NavigationMenuPrimitive.Positioner
          anchor={anchor}
          className="isolate z-50 h-(--positioner-height) w-(--anchor-width) data-instant:transition-none"
          side="bottom"
          sideOffset={0}
        >
          <NavigationMenuPrimitive.Popup className="h-(--popup-height) w-(--popup-width) bg-gm-navy-raised shadow-card transition-[opacity,height] duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0">
            <NavigationMenuPrimitive.Viewport className="relative size-full overflow-hidden" />
          </NavigationMenuPrimitive.Popup>
        </NavigationMenuPrimitive.Positioner>
      </NavigationMenuPrimitive.Portal>
    </NavigationMenuPrimitive.Root>
  );
}
