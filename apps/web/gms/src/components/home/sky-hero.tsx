import { MapPinIcon } from "lucide-react";
import { DayPanel } from "@/components/home/day-panel";
import { NowCard } from "@/components/home/now-card";
import { SkyDayStrip, type StripDay } from "@/components/home/sky-day-strip";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { getForecastDays } from "@/lib/forecast-days";
import { rainChance } from "@/lib/hero-readings";
import {
  defaultLocation,
  locationHref,
  type SiteLocation,
} from "@/lib/locations";

/** "Maurice Bishop International (MBIA)" → "MBIA". */
const STATION_CODE = /^.*\((.+)\)$/;

/**
 * Bold sky hero: the place, then the Now card beside the five day tabs and
 * the selected day's panel (stacked on phones: Now, tabs, panel). The
 * gradient is the only one on the site; small text always sits on
 * `bg-gm-scrim` (the gradient's light stop is under AA for small type).
 */
export function SkyHero({
  children,
  location = defaultLocation(),
  now,
  selected,
  switcher,
  weather,
}: {
  /** Extra hero rows under the panels. */
  children?: React.ReactNode;
  location?: SiteLocation;
  /** Clock for the stale-reading line; defaults to the render time. */
  now?: Date;
  /** `YYYY-MM-DD` of the day in the panel; defaults to today. */
  selected?: string;
  /** Location switcher; rendered only when more than one place is enabled. */
  switcher?: React.ReactNode;
  weather: WeatherSnapshot;
}) {
  const days: StripDay[] = getForecastDays(weather.baseDate, weather.days).map(
    (day, index) => ({
      ...day,
      href: day.isToday ? locationHref(location, "/") : day.path,
      rain: weather.days[index] ? rainChance(weather.days[index], index) : null,
    })
  );
  const found = days.findIndex((day) => day.slug === selected);
  const index = found === -1 ? 0 : found;
  const station = location.station.replace(STATION_CODE, "$1");

  return (
    <section
      aria-labelledby="sky-hero-title"
      className="bg-gm-gradient-sky text-gm-text-inverse"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 px-4 pt-2 pb-4 sm:px-6 lg:gap-2.5 lg:pt-3 lg:pb-6 xl:px-8">
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
          <h1
            className="flex items-center gap-1 font-bold text-body-sm leading-body-sm"
            id="sky-hero-title"
          >
            <MapPinIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="sr-only">{location.name} weather, </span>
            {station}
          </h1>
          {switcher}
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-2.5">
          <NowCard now={now} weather={weather} />
          <div className="grid min-w-0 content-start gap-2 lg:gap-2.5">
            <SkyDayStrip days={days} selected={days[index]?.slug ?? ""} />
            {weather.days[index] && (
              <DayPanel
                day={weather.days[index]}
                index={index}
                note={location.isDefault ? undefined : weather.label}
              />
            )}
          </div>
        </div>

        {children}
      </div>
    </section>
  );
}
