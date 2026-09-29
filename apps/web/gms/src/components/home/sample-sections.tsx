import type { LucideIcon } from "lucide-react";
import {
  ArrowRightIcon,
  CloudRainIcon,
  FishIcon,
  FootprintsIcon,
  HazeIcon,
  MoonIcon,
  RadarIcon,
  SailboatIcon,
  SatelliteDishIcon,
  SproutIcon,
  SunIcon,
  TornadoIcon,
  UmbrellaIcon,
  WavesIcon,
} from "lucide-react";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";

/*
 * Home sections with no data source yet. Every figure here is sample content
 * from the Bold sky mockup and each section says so with PlaceholderNotice;
 * status chips are neutral, never hazard colours, so a sample can never read
 * as a warning. Replace each with its product once it is issued.
 */

const CHIP =
  "w-fit rounded-full bg-gm-surface-secondary px-2 py-0.5 font-bold text-caption text-gm-navy leading-caption";

interface GlanceTile {
  detail: string;
  href: string;
  Icon: LucideIcon;
  label: string;
  status: string;
  value: string;
}

const GLANCE: GlanceTile[] = [
  {
    Icon: TornadoIcon,
    label: "Tropics",
    status: "Watching",
    value: "Tropical wave near 50°W",
    detail: "20% chance of development in 7 days.",
    href: "/weather/tropics",
  },
  {
    Icon: WavesIcon,
    label: "Sea",
    status: "Caution",
    value: "Moderate, 1.5–2.0 m",
    detail: "Easterly swell, period 8 s.",
    href: "/marine/forecast",
  },
  {
    Icon: SunIcon,
    label: "UV",
    status: "Extreme",
    value: "Extreme, 11",
    detail: "Strongest 10 AM to 2 PM.",
    href: "/weather/uv",
  },
  {
    Icon: HazeIcon,
    label: "Saharan dust",
    status: "Low",
    value: "Low",
    detail: "A thin plume may arrive Friday.",
    href: "/weather/dust",
  },
  {
    Icon: CloudRainIcon,
    label: "Rain",
    status: "40%",
    value: "Scattered showers",
    detail: "Mostly in the east and interior.",
    href: "/weather/rainfall",
  },
];

export function TodayAtAGlance() {
  return (
    <HomeSection kicker="Today" title="Today at a glance">
      <PlaceholderNotice compact product="Today at a glance" />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {GLANCE.map(({ Icon, ...tile }) => (
          <li key={tile.label}>
            <Link
              className={`${HOME_CARD} flex h-full flex-col gap-1.5 hover:border-gm-blue-ink`}
              href={tile.href}
            >
              <span className="flex items-center gap-2 font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
                <Icon aria-hidden="true" className="size-4" />
                {tile.label}
              </span>
              <span className={CHIP}>{tile.status}</span>
              <span className="font-bold text-body-base text-gm-navy leading-body-base">
                {tile.value}
              </span>
              <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                {tile.detail}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}

/**
 * Live imagery entry points beside the forecaster's note. The note is the
 * issued summary (live); only the map panel is a placeholder until the
 * interactive map exists.
 */
export function WeatherNow({ forecasterNote }: { forecasterNote: string }) {
  const layers = [
    { href: "/weather/satellite", label: "Satellite", Icon: SatelliteDishIcon },
    { href: "/weather/radar", label: "Radar", Icon: RadarIcon },
    { href: "/weather/rainfall", label: "Rainfall", Icon: UmbrellaIcon },
  ];
  return (
    <HomeSection
      kicker="Live"
      link={{ href: "/weather/map", label: "Open interactive map" }}
      title="Weather now"
      tone="surface"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col overflow-hidden rounded-gm-card bg-gm-navy text-gm-text-inverse">
          <div className="flex gap-1 overflow-x-auto p-2">
            {layers.map(({ href, label, Icon }) => (
              <Link
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 font-semibold text-body leading-body hover:bg-gm-text-inverse/10"
                href={href}
                key={href}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            ))}
          </div>
          <div className="flex aspect-16/10 flex-col items-center justify-center gap-2 bg-gm-navy-raised p-6 text-center">
            <p className="font-bold font-gm-display text-heading-md uppercase leading-heading-md tracking-wide">
              Interactive map coming soon
            </p>
            <p className="max-w-sm text-body text-gm-text-inverse/80 leading-body">
              Satellite, radar, rainfall, lightning and wind on one map of the
              southern Windwards. Until then, open each layer above.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-gm-sky border-l-3 pl-4">
          <p className="font-bold text-gm-text-muted text-label uppercase leading-label tracking-wider">
            From the duty forecaster
          </p>
          <p className="text-body-base leading-body-base">{forecasterNote}</p>
          <Link
            className="flex items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
            href="/weather/synopsis"
          >
            Read the weather synopsis
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </HomeSection>
  );
}

const ACTIVITIES = [
  {
    Icon: UmbrellaIcon,
    label: "Beach",
    rating: 4,
    value: "Good until 11 AM",
    detail: "Grand Anse calm; UV extreme after 10",
    href: "/marine/beaches",
  },
  {
    Icon: FishIcon,
    label: "Fishing",
    rating: 3,
    value: "Fair",
    detail: "Best near sunrise, moderate seas",
    href: "/marine/fishing",
  },
  {
    Icon: SailboatIcon,
    label: "Boating",
    rating: 2,
    value: "Use caution",
    detail: "Channels choppy, E 25–35 km/h",
    href: "/marine/forecast",
  },
  {
    Icon: SproutIcon,
    label: "Growing",
    rating: 2,
    value: "Dry spell, 8 days",
    detail: "Irrigate seedlings; rain Tuesday",
    href: "/services/agriculture",
  },
  {
    Icon: FootprintsIcon,
    label: "Outdoors",
    rating: 3,
    value: "Hot after 11 AM",
    detail: "Heat index 38°C at midday",
    href: "/weather/heat",
  },
  {
    Icon: MoonIcon,
    label: "Night sky",
    rating: 4,
    value: "Good viewing",
    detail: "Saturn visible, 20% cloud",
    href: "/weather/sun-and-sky/night-sky",
  },
] as const;

const METER_STEPS = [1, 2, 3, 4, 5] as const;

export function ExploreToday() {
  return (
    <HomeSection kicker="Plan your day" title="Explore today">
      <PlaceholderNotice compact product="Explore today" />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {ACTIVITIES.map(({ Icon, ...activity }) => (
          <li key={activity.label}>
            <Link
              className={`${HOME_CARD} flex h-full flex-col gap-2 hover:border-gm-blue-ink`}
              href={activity.href}
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-gm-navy text-gm-lime">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="font-bold text-body-base text-gm-navy leading-body-base">
                {activity.label}
              </span>
              <span className="font-semibold text-body text-gm-navy leading-body">
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
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}

const RAIN_SO_FAR = 86;
const RAIN_NORMAL = 120;
const RAIN_SCALE = 140;

export function GrenadaInData() {
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
    <HomeSection
      kicker="From the national climate record"
      link={{ href: "/climate", label: "Climate" }}
      title="Grenada in data"
      tone="surface"
    >
      <PlaceholderNotice compact product="Grenada in data" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <li className={`${HOME_CARD} flex flex-col gap-1.5`} key={stat.label}>
            <span className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
              {stat.label}
            </span>
            <span className="font-bold font-gm-display text-gm-navy text-gm-numeral tabular-nums">
              {stat.value}
              <span className="ml-1 font-sans font-semibold text-body-base text-gm-text-secondary leading-body-base">
                {stat.unit}
              </span>
            </span>
            <span className="text-body-sm text-gm-text-secondary leading-body-sm">
              {stat.detail}
            </span>
            {stat.bar && (
              <span
                aria-label={`${RAIN_SO_FAR} mm against a ${RAIN_NORMAL} mm normal`}
                className="relative mt-2 block h-3 rounded-full bg-gm-surface-muted"
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

export function Discover() {
  const cards = [
    {
      kicker: "Tonight",
      title: "Waning gibbous moon, Saturn in the east",
      detail: "Sun, moon and twilight times",
      href: "/weather/sun-and-sky",
      Icon: MoonIcon,
      tone: "bg-gm-navy text-gm-lime",
    },
    {
      kicker: "On this day",
      title: "7 September 2004: Hurricane Ivan",
      detail: "The storm that changed how Grenada prepares",
      href: "/explore/history/hurricanes",
      Icon: TornadoIcon,
      tone: "bg-gm-sky-deep text-gm-text-inverse",
    },
    {
      kicker: "Weather quiz",
      title: "Can you name these five clouds?",
      detail: "5 questions · 2 minutes",
      href: "/explore/quiz",
      Icon: CloudRainIcon,
      tone: "bg-gm-lime text-gm-navy",
    },
    {
      kicker: "Hurricane names",
      title: "How storms are named, and why names retire",
      detail: "The Atlantic lists explained",
      href: "/explore/hurricane-names",
      Icon: WavesIcon,
      tone: "bg-gm-sky-mid text-gm-text-inverse",
    },
  ];
  return (
    <HomeSection kicker="Discover" title="Sky, history and a little fun">
      <PlaceholderNotice compact product="Tonight's sky" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ Icon, ...card }) => (
          <li key={card.href}>
            <Link
              className="flex h-full flex-col overflow-hidden rounded-gm-card border border-gm-border bg-background hover:border-gm-blue-ink"
              href={card.href}
            >
              <span
                className={`flex aspect-16/7 items-center justify-center ${card.tone}`}
              >
                <Icon
                  aria-hidden="true"
                  className="size-12"
                  strokeWidth={1.4}
                />
              </span>
              <span className="flex flex-col gap-1 p-4">
                <span className="font-bold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
                  {card.kicker}
                </span>
                <span className="font-bold text-body-base text-gm-navy leading-body-base">
                  {card.title}
                </span>
                <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                  {card.detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
