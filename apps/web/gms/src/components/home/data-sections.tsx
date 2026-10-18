import {
  FishIcon,
  HardHatIcon,
  HeartPulseIcon,
  PalmtreeIcon,
  PlaneIcon,
  SproutIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import { Provenance } from "@/components/pages/provenance";
import {
  fetchHomeContent,
  isSectionHidden,
  relatedHref,
  sectionWords,
} from "@/lib/cms";
import { monthStats } from "@/lib/month-summary";
import { fetchMonthSummary } from "@/lib/products";
import { cn } from "@/lib/utils";

/*
 * Owner rule (18 Oct 2026): the public site never shows invented or sample
 * figures. Explore today has no data source for sector impacts yet, so each
 * sector says so honestly and links to its service page; nothing here states
 * a hazard or an impact level. Grenada in data is live from the MBIA register
 * month summary and shows an unavailable state, never sample figures.
 */

/** `reading` is the CMS key editors use to hang a story off a tile. */
const SECTORS = [
  {
    Icon: PalmtreeIcon,
    sector: "Tourism",
    href: "/services/tourism",
    reading: "beach",
  },
  {
    Icon: FishIcon,
    sector: "Fisheries",
    href: "/marine/fishing",
    reading: "fishing",
  },
  { Icon: PlaneIcon, sector: "Aviation", href: "/services/aviation" },
  {
    Icon: SproutIcon,
    sector: "Agriculture",
    href: "/services/agriculture",
    reading: "growing",
  },
  { Icon: HardHatIcon, sector: "Construction", href: "/services/construction" },
  {
    Icon: HeartPulseIcon,
    sector: "Health",
    href: "/services/health",
    reading: "outdoors",
  },
] as const;

/**
 * Sectors and where to read about each. Sector impacts will come from
 * FastAPI once published; until then the tiles say so. Editors can reword the
 * heading and hang a published story or explainer off a tile.
 */
export async function ExploreToday() {
  if (await isSectionHidden("explore-today")) return null;
  const { settings } = await fetchHomeContent();
  const words = sectionWords(settings, "explore-today", {
    kicker: "Plan your week",
    title: "What this week means for you",
  });
  return (
    <HomeSection tone="surface" {...words}>
      <ul className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3">
        {SECTORS.map(({ Icon, ...service }) => {
          const reading =
            "reading" in service
              ? settings.exploreReading[service.reading]
              : undefined;
          return (
            <li className="flex flex-col gap-0.5 sm:gap-1" key={service.href}>
              <Link
                className={cn(
                  HOME_CARD,
                  "flex h-full flex-col gap-1.5 p-3 hover:border-gm-blue-ink sm:gap-2 sm:p-4 lg:p-5"
                )}
                href={service.href}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gm-navy text-gm-lime sm:size-10">
                    <Icon aria-hidden="true" className="size-4 sm:size-5" />
                  </span>
                  <span className="truncate font-semibold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
                    {service.sector}
                  </span>
                </span>
                <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                  Impact outlook not yet published
                </span>
              </Link>
              {reading && (
                <Link
                  className="px-1 font-semibold text-body-sm text-gm-blue-ink leading-body-sm hover:underline"
                  href={relatedHref(reading) as Route}
                >
                  <span className="sr-only">{service.sector}: </span>
                  Read: {reading.title}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </HomeSection>
  );
}

export async function GrenadaInData() {
  if (await isSectionHidden("grenada-in-data")) return null;
  const [{ settings }, summary] = await Promise.all([
    fetchHomeContent(),
    fetchMonthSummary(),
  ]);
  const words = sectionWords(settings, "grenada-in-data", {
    kicker: "This month so far, from the MBIA observation register",
    title: "Grenada in data",
  });
  const month = summary ? monthStats(summary) : null;
  return (
    <HomeSection {...words} link={{ href: "/climate", label: "Climate" }}>
      {month ? (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {month.stats.map((stat) => (
              <li
                className={cn(
                  HOME_CARD,
                  "flex flex-col gap-1 p-3 sm:p-4 lg:p-5"
                )}
                key={stat.label}
              >
                <span className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
                  {stat.label}
                </span>
                <span className="font-bold font-gm-display text-gm-heading text-heading-md tabular-nums leading-heading-md lg:text-gm-numeral">
                  {stat.value ?? "—"}
                  {stat.value !== null && (
                    <span className="ml-1 font-sans font-semibold text-body-sm text-gm-text-secondary leading-body-sm lg:text-body-base lg:leading-body-base">
                      {stat.unit}
                    </span>
                  )}
                </span>
                <span className="text-caption text-gm-text-secondary leading-caption lg:text-body-sm lg:leading-body-sm">
                  {stat.value === null ? "Not reported yet" : stat.detail}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-gm-text-secondary leading-caption lg:text-body-sm lg:leading-body-sm">
            {month.caption}
          </p>
          <Provenance
            kind="observation"
            source="GMS observation register, Maurice Bishop International Airport"
            status={month.provisional ? "provisional" : "verified"}
            time={month.lastObservationAt}
          />
        </>
      ) : (
        <p
          className={cn(HOME_CARD, "p-4 text-body-sm text-gm-text-secondary")}
          role="status"
        >
          Month-to-date figures are not available right now.
        </p>
      )}
    </HomeSection>
  );
}
