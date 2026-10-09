import Link from "next/link";
import { DayPanel, DaySummary } from "@/components/home/day-panel";
import { NowPanel, NowSummary } from "@/components/home/now-card";
import { SkyDayStrip, type StripDay } from "@/components/home/sky-day-strip";
import { localTime } from "@/lib/current-conditions";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { getForecastDays } from "@/lib/forecast-days";
import { rainChance, skyFromWords } from "@/lib/hero-readings";
import {
  defaultLocation,
  locationHref,
  type SiteLocation,
} from "@/lib/locations";
import { cn } from "@/lib/utils";

/** "Maurice Bishop International (MBIA)" → "MBIA". */
const STATION_CODE = /^.*\((.+)\)$/;

/**
 * Bold sky hero, the same table layout at every width: a Now tab for the
 * latest reading, then a tab per forecast day, and the selected tab's panel
 * under them. Phones lead with a picture card for the selected tab and show
 * Now as the first column of the strip; wider screens put the Now card beside
 * the day tabs. Now is selected unless a day is. The gradient is the only one
 * on the site; small text always sits on `bg-gm-scrim` (the gradient's light
 * stop is under AA for small type).
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
  /** `YYYY-MM-DD` of the day in the panel, or `today`; Now when omitted. */
  selected?: string;
  /** Location switcher; rendered only when more than one place is enabled. */
  switcher?: React.ReactNode;
  weather: WeatherSnapshot;
}) {
  const days: StripDay[] = getForecastDays(weather.baseDate, weather.days).map(
    (day, index) => ({
      ...day,
      href: day.path,
      rain: weather.days[index] ? rainChance(weather.days[index], index) : null,
    })
  );
  const wanted = selected === "today" ? days[0]?.slug : selected;
  const index = days.findIndex((day) => day.slug === wanted);
  const tab = index === -1 ? "now" : days[index].slug;
  const station = location.station.replace(STATION_CODE, "$1");
  const nowHref = locationHref(location, "/");
  const current = weather.current;
  const nowCurrent = tab === "now";

  return (
    <section
      aria-labelledby="sky-hero-title"
      className="bg-gm-gradient-sky text-gm-text-inverse"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 px-4 pt-2 pb-4 sm:px-6 lg:gap-2.5 lg:pt-3 lg:pb-6 xl:px-8">
        {/* The place is shown in the first card; the heading is for screen readers. */}
        <h1 className="sr-only" id="sky-hero-title">
          {location.name} weather, {station}
        </h1>
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {/* Brand line: large bold type, readable on the gradient. */}
          <p className="font-bold font-gm-display text-heading-md uppercase leading-heading-md tracking-wide">
            Your spice weather
          </p>
          {switcher}
        </div>

        <div className="rounded-gm-card bg-gm-scrim p-4 sm:hidden">
          {nowCurrent || index === -1 ? (
            <NowSummary now={now} station={station} weather={weather} />
          ) : (
            <DaySummary day={days[index]} />
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,5fr)] lg:gap-2.5">
          <Link
            aria-current={nowCurrent ? "page" : undefined}
            className={cn(
              "hidden rounded-gm-card border-b-4 bg-gm-scrim p-3 outline-none hover:bg-gm-text-inverse/10 focus-visible:ring-2 focus-visible:ring-gm-lime sm:block lg:p-4",
              nowCurrent
                ? "border-gm-lime bg-gm-text-inverse/20"
                : "border-transparent"
            )}
            data-analytics-day="now"
            data-analytics-event="forecast_tab_selected"
            href={nowHref}
            scroll={false}
          >
            <NowSummary compact now={now} station={station} weather={weather} />
          </Link>
          <SkyDayStrip
            days={days}
            now={{
              href: nowHref,
              sky: skyFromWords(current?.weather ?? null),
              temperature:
                current?.temperature ??
                weather.observation?.temperature ??
                null,
              time: current ? localTime(current.observedAt) : null,
            }}
            selected={tab}
          />
        </div>

        {nowCurrent || !weather.days[index] ? (
          <NowPanel weather={weather} />
        ) : (
          <DayPanel
            day={weather.days[index]}
            index={index}
            note={location.isDefault ? undefined : weather.label}
          />
        )}

        {children}
      </div>
    </section>
  );
}
