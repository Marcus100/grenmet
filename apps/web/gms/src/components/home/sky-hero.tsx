import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { HeroFacts, SourceChip } from "@/components/home/hero-facts";
import { SkyDayStrip } from "@/components/home/sky-day-strip";
import { TodayPanel } from "@/components/home/today-panel";
import { isStale, localTime } from "@/lib/current-conditions";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { getForecastDays } from "@/lib/forecast-days";
import {
  defaultLocation,
  locationHref,
  type SiteLocation,
} from "@/lib/locations";

/**
 * Bold sky hero (Option A): what MBIA measured beside what was issued for
 * today, then the forecast days. Every figure carries its provenance chip.
 * The gradient is the only one on the site; small text always sits on
 * `bg-gm-scrim` (the gradient's light stop is under AA for small type).
 */
export function SkyHero({
  location = defaultLocation(),
  now,
  switcher,
  weather,
}: {
  location?: SiteLocation;
  /** Clock for the stale-reading label; defaults to the render time. */
  now?: Date;
  /** Location switcher; rendered only when more than one place is enabled. */
  switcher?: React.ReactNode;
  weather: WeatherSnapshot;
}) {
  const today = weather.days[0];

  return (
    <section
      aria-labelledby="sky-hero-title"
      className="bg-gm-gradient-sky text-gm-text-inverse"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 pt-5 pb-6 sm:px-6 lg:pt-7 lg:pb-8 xl:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1
            className="font-bold text-body-base leading-body-base"
            id="sky-hero-title"
          >
            {location.name} weather
            <span className="ml-2 font-normal text-gm-text-inverse/85">
              {location.station}
            </span>
          </h1>
          {switcher}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <NowPanel now={now} station={location.station} weather={weather} />
          <TodayPanel
            fallback={today}
            issues={weather.todayIssues}
            note={weather.label}
          />
        </div>

        <SkyDayStrip
          days={getForecastDays(weather.baseDate, weather.days)}
          todayHref={locationHref(location, "/weather")}
          todayPaths={[
            locationHref(location, "/"),
            locationHref(location, "/weather"),
          ]}
        />

        <div className="flex flex-wrap gap-2">
          <Link
            className="flex h-11 items-center gap-2 rounded-md bg-gm-lime px-4 font-bold text-body text-gm-navy leading-body"
            href="/weather/7-day"
          >
            7-day forecast
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
          <Link
            className="flex h-11 items-center rounded-md border border-gm-text-inverse/60 bg-gm-scrim px-4 font-bold text-body leading-body"
            href="/weather/3-day"
          >
            3-day
          </Link>
          <Link
            className="flex h-11 items-center rounded-md border border-gm-text-inverse/60 bg-gm-scrim px-4 font-bold text-body leading-body"
            href="/marine/forecast"
          >
            Marine
          </Link>
        </div>
      </div>
    </section>
  );
}

/** "Maurice Bishop International (MBIA)" → "MBIA". */
const STATION_CODE = /^.*\((.+)\)$/;

function Numeral({ value }: { value: number | null }) {
  return (
    <p className="font-gm-display font-semibold text-gm-numeral-hero tabular-nums">
      {value === null ? (
        <>
          —<span className="sr-only">No current temperature</span>
        </>
      ) : (
        <>
          {Math.round(value)}°<span className="sr-only">C</span>
        </>
      )}
    </p>
  );
}

/** The latest register reading; the midday product temperature as fallback. */
function NowPanel({
  now,
  station,
  weather,
}: {
  now?: Date;
  station: string;
  weather: WeatherSnapshot;
}) {
  const current = weather.current;
  let chip: string | null = null;
  if (current) {
    const time = localTime(current.observedAt);
    chip = isStale(current.observedAt, now)
      ? `Last observed ${time}`
      : `Observed ${time}`;
    if (current.provisional) chip += " · provisional";
  } else if (weather.observation) {
    chip = "Midday reading";
  }
  const temperature =
    current?.temperature ?? weather.observation?.temperature ?? null;
  let detail = "No current observation";
  if (current) {
    detail =
      current.dewPoint === null
        ? ""
        : `Dew point ${Math.round(current.dewPoint)}°`;
  } else if (weather.observation) {
    detail = weather.observation.observedAt;
  }

  return (
    <div className="grid min-w-0 content-start gap-3 rounded-gm-card bg-gm-scrim p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-gm-text-inverse/85 text-label uppercase leading-label tracking-wider">
          Now at {station.replace(STATION_CODE, "$1")}
        </h2>
        {chip && <SourceChip kind="observed">{chip}</SourceChip>}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Numeral value={temperature} />
        <div>
          {current?.weather && (
            <p className="font-bold font-gm-display text-heading-md uppercase leading-heading-md tracking-wide">
              {current.weather}
            </p>
          )}
          {detail && (
            <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
              {detail}
            </p>
          )}
        </div>
      </div>
      {current && (
        <HeroFacts
          foldLabel="More readings"
          tiles={[...current.primary, ...current.extra]}
        />
      )}
    </div>
  );
}
