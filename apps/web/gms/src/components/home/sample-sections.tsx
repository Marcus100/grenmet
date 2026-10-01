import {
  FishIcon,
  FootprintsIcon,
  MoonIcon,
  SailboatIcon,
  SproutIcon,
  UmbrellaIcon,
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

const ACTIVITIES = [
  {
    Icon: UmbrellaIcon,
    key: "beach",
    label: "Beach",
    rating: 4,
    value: "Good until 11 AM",
    detail: "Grand Anse calm; UV extreme after 10",
    href: "/marine/beaches",
  },
  {
    Icon: FishIcon,
    key: "fishing",
    label: "Fishing",
    rating: 3,
    value: "Fair",
    detail: "Best near sunrise, moderate seas",
    href: "/marine/fishing",
  },
  {
    Icon: SailboatIcon,
    key: "boating",
    label: "Boating",
    rating: 2,
    value: "Use caution",
    detail: "Channels choppy, E 25–35 km/h",
    href: "/marine/forecast",
  },
  {
    Icon: SproutIcon,
    key: "growing",
    label: "Growing",
    rating: 2,
    value: "Dry spell, 8 days",
    detail: "Irrigate seedlings; rain Tuesday",
    href: "/services/agriculture",
  },
  {
    Icon: FootprintsIcon,
    key: "outdoors",
    label: "Outdoors",
    rating: 3,
    value: "Hot after 11 AM",
    detail: "Heat index 38°C at midday",
    href: "/weather/heat",
  },
  {
    Icon: MoonIcon,
    key: "night-sky",
    label: "Night sky",
    rating: 4,
    value: "Good viewing",
    detail: "Saturn visible, 20% cloud",
    href: "/weather/sun-and-sky/night-sky",
  },
] as const;

const METER_STEPS = [1, 2, 3, 4, 5] as const;

/**
 * Activities, ratings and figures will come from FastAPI; editors can only
 * reword the heading and hang a published story or explainer off an activity.
 */
export async function ExploreToday() {
  if (await isSectionHidden("explore-today")) return null;
  const { settings } = await fetchHomeContent();
  const words = sectionWords(settings, "explore-today", {
    kicker: "Plan your day",
    title: "Explore today",
  });
  return (
    <HomeSection tone="surface" {...words}>
      <ul className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
        {ACTIVITIES.map(({ Icon, ...activity }) => {
          const reading = settings.exploreReading[activity.key];
          return (
            <li className="flex flex-col gap-0.5 sm:gap-1" key={activity.key}>
              <Link
                className={cn(
                  HOME_CARD,
                  "flex h-full flex-col gap-1.5 p-3 hover:border-gm-blue-ink sm:gap-2 sm:p-4 lg:p-5"
                )}
                href={activity.href}
              >
                <span className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gm-navy text-gm-lime sm:size-10">
                    <Icon aria-hidden="true" className="size-4 sm:size-5" />
                  </span>
                  <span className="font-bold text-body-base text-gm-heading leading-body-base">
                    {activity.label}
                  </span>
                </span>
                <span className="font-semibold text-body text-gm-heading leading-body">
                  {activity.value}
                </span>
                <span
                  aria-label={`${activity.rating} of 5`}
                  className="flex gap-0.5"
                  role="img"
                >
                  {METER_STEPS.map((step) => (
                    <span
                      className={
                        step <= activity.rating
                          ? "h-1.5 flex-1 rounded-full bg-gm-sky-ink"
                          : "h-1.5 flex-1 rounded-full bg-gm-surface-muted"
                      }
                      key={step}
                    />
                  ))}
                </span>
                <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                  {activity.detail}
                </span>
              </Link>
              {reading && (
                <Link
                  className="px-1 font-semibold text-body-sm text-gm-blue-ink leading-body-sm hover:underline"
                  href={relatedHref(reading)}
                >
                  <span className="sr-only">{activity.label}: </span>
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
    kicker: "From the national climate record",
    title: "Grenada in data",
  });
  const stats = [
    {
      label: "Rainfall this month · MBIA",
      value: String(RAIN_SO_FAR),
      unit: "mm",
      detail: `${Math.round((RAIN_SO_FAR / RAIN_NORMAL) * 100)}% of the September normal to date (${RAIN_NORMAL} mm)`,
      bar: true,
    },
    {
      label: "Temperature vs normal",
      value: "+0.8",
      unit: "°C",
      detail: "September mean; 12 months above normal",
    },
    {
      label: "Sea temperature",
      value: "29.4",
      unit: "°C",
      detail: "+0.6 °C above normal around Grenada",
    },
    {
      label: "Dry days · MBIA",
      value: "8",
      unit: "days",
      detail: "since the last day with 5 mm or more",
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
