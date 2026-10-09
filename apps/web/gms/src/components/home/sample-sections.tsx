import {
  DropletIcon,
  FishIcon,
  HardHatIcon,
  HeartPulseIcon,
  type LucideIcon,
  PalmtreeIcon,
  PlaneIcon,
  SproutIcon,
  SunIcon,
  WavesIcon,
} from "lucide-react";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import {
  fetchHomeContent,
  isSectionHidden,
  relatedHref,
  sectionWords,
} from "@/lib/cms";
import { cn } from "@/lib/utils";

/*
 * Home sections with no data source yet. Every figure here is sample content
 * from the Bold sky mockup. Explore today and Grenada in data carry no
 * notice by owner decision (30 Sep 2026); their figures move to
 * FastAPI endpoints. Status chips are neutral, never hazard colours, so a sample can never read
 * as a warning. Replace each with its product once it is issued.
 */

/** wxproducts impact levels, lowest first; the meter fills one step per level. */
const IMPACT_LEVELS = ["Minimal", "Minor", "Significant", "Severe"] as const;

type HazardKind = "heat" | "rain" | "seas" | "wind";

const HAZARD_GLYPH: Record<Exclude<HazardKind, "wind">, LucideIcon> = {
  heat: SunIcon,
  rain: DropletIcon,
  seas: WavesIcon,
};

/** Wind steps rise like a signal meter; the other hazards repeat a glyph. */
const WIND_STEP = ["h-1.5", "h-2.5", "h-3.5", "h-4.5"] as const;

/**
 * Impact meter shaped by the hazard: droplets for rain, waves for seas,
 * suns for heat, rising bars for wind. One step fills per impact level.
 * Neutral colours only, so a sample never reads as a warning.
 */
function HazardMeter({ kind, level }: { kind: HazardKind; level: number }) {
  const label = `${IMPACT_LEVELS[level - 1]} impact`;
  if (kind === "wind") {
    return (
      <span
        aria-label={label}
        className="flex h-4.5 items-end gap-1"
        role="img"
      >
        {WIND_STEP.map((height, step) => (
          <span
            className={cn(
              "w-2.5 rounded-sm",
              height,
              step < level ? "bg-gm-sky-ink" : "bg-gm-surface-muted"
            )}
            key={height}
          />
        ))}
      </span>
    );
  }
  const Glyph = HAZARD_GLYPH[kind];
  return (
    <span aria-label={label} className="flex gap-1" role="img">
      {IMPACT_LEVELS.map((name, step) => (
        <Glyph
          aria-hidden="true"
          className={cn(
            "size-4.5",
            step < level ? "text-gm-sky-ink" : "text-gm-surface-muted"
          )}
          fill={kind === "rain" && step < level ? "currentColor" : "none"}
          key={name}
          strokeWidth={2}
        />
      ))}
    </span>
  );
}

/**
 * Impact by sector: how this week's hazards affect each sector. Mirrors the
 * wxproducts impact fields (hazard, impact level); sample until FastAPI
 * supplies it. The meter is neutral, never hazard colours. `reading` is the
 * CMS key editors use to hang a story off a tile.
 */
const SECTORS = [
  {
    Icon: PalmtreeIcon,
    sector: "Tourism",
    period: "Today",
    hazard: "PM showers",
    kind: "rain",
    level: 2,
    href: "/services/tourism",
    reading: "beach",
  },
  {
    Icon: FishIcon,
    sector: "Fisheries",
    period: "Today",
    hazard: "Moderate seas",
    kind: "seas",
    level: 2,
    href: "/marine/fishing",
    reading: "fishing",
  },
  {
    Icon: PlaneIcon,
    sector: "Aviation",
    period: "Today",
    hazard: "Gusty showers",
    kind: "wind",
    level: 2,
    href: "/services/aviation",
  },
  {
    Icon: SproutIcon,
    sector: "Agriculture",
    period: "This week",
    hazard: "Rain Tuesday",
    kind: "rain",
    level: 1,
    href: "/services/agriculture",
    reading: "growing",
  },
  {
    Icon: HardHatIcon,
    sector: "Construction",
    period: "This week",
    hazard: "Gusts 32 mph",
    kind: "wind",
    level: 2,
    href: "/services/construction",
  },
  {
    Icon: HeartPulseIcon,
    sector: "Health",
    period: "This week",
    hazard: "Midday heat",
    kind: "heat",
    level: 2,
    href: "/services/health",
    reading: "outdoors",
  },
] as const;

/**
 * Hazard impacts by sector. Impacts will come from
 * FastAPI; editors can only reword the heading and hang a published story or
 * explainer off a tile.
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
                  <span className="grid min-w-0 font-semibold text-label uppercase leading-label tracking-wider">
                    <span className="truncate text-gm-sky-ink">
                      {service.sector}
                    </span>
                    <span className="truncate text-gm-text-secondary">
                      {service.period}
                    </span>
                  </span>
                </span>
                <span className="truncate font-bold text-body-base text-gm-heading leading-body-base">
                  {service.hazard}
                </span>
                <HazardMeter kind={service.kind} level={service.level} />
              </Link>
              {reading && (
                <Link
                  className="px-1 font-semibold text-body-sm text-gm-blue-ink leading-body-sm hover:underline"
                  href={relatedHref(reading)}
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

const RAIN_SO_FAR = 86;
const RAIN_NORMAL = 120;
const RAIN_SCALE = 140;

export async function GrenadaInData() {
  if (await isSectionHidden("grenada-in-data")) return null;
  const { settings } = await fetchHomeContent();
  const words = sectionWords(settings, "grenada-in-data", {
    kicker: "This month so far, from the monthly climate summary",
    title: "Grenada in data",
  });
  const stats = [
    {
      label: "Rainfall this month · MBIA",
      value: String(RAIN_SO_FAR),
      unit: "mm",
      detail: `${Math.round((RAIN_SO_FAR / RAIN_NORMAL) * 100)}% of the October normal to date (${RAIN_NORMAL} mm)`,
      bar: true,
    },
    {
      label: "Highest temperature · MBIA",
      value: "32.6",
      unit: "°C",
      detail: "on 3 October; normal monthly high 31.4 °C",
    },
    {
      label: "Lowest temperature · MBIA",
      value: "23.8",
      unit: "°C",
      detail: "on 6 October; normal monthly low 23.5 °C",
    },
    {
      label: "Rain days · MBIA",
      value: "5",
      unit: "days",
      detail: "with 1 mm or more; normal to date is 6",
    },
  ];
  return (
    <HomeSection {...words} link={{ href: "/climate", label: "Climate" }}>
      <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <li
            className={cn(HOME_CARD, "flex flex-col gap-1 p-3 sm:p-4 lg:p-5")}
            key={stat.label}
          >
            <span className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
              {stat.label}
            </span>
            <span className="font-bold font-gm-display text-gm-heading text-heading-md tabular-nums leading-heading-md lg:text-gm-numeral">
              {stat.value}
              <span className="ml-1 font-sans font-semibold text-body-sm text-gm-text-secondary leading-body-sm lg:text-body-base lg:leading-body-base">
                {stat.unit}
              </span>
            </span>
            <span className="text-caption text-gm-text-secondary leading-caption lg:text-body-sm lg:leading-body-sm">
              {stat.detail}
            </span>
            {stat.bar && (
              <span
                aria-label={`${RAIN_SO_FAR} mm against a ${RAIN_NORMAL} mm normal`}
                className="relative mt-1 block h-2 rounded-full bg-gm-surface-muted lg:mt-2 lg:h-3"
                role="img"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-gm-blue"
                  style={{ width: `${(RAIN_SO_FAR / RAIN_SCALE) * 100}%` }}
                />
                <span
                  className="absolute -inset-y-1 w-0.5 bg-gm-navy"
                  style={{ left: `${(RAIN_NORMAL / RAIN_SCALE) * 100}%` }}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
