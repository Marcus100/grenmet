import { DayPanel } from "@/components/home/day-panel";
import { DayCard, NowCard } from "@/components/home/hero-card";
import { ByTab, HeroSelectionProvider } from "@/components/home/hero-selection";
import { NowPanel } from "@/components/home/now-card";
import { SkyDayStrip, type StripDay } from "@/components/home/sky-day-strip";
import { UnitsToggle } from "@/components/units-toggle";
import {
  isOtherGrenadaDay,
  isStale,
  localTime,
  localWeekday,
} from "@/lib/current-conditions";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { getForecastDays } from "@/lib/forecast-days";
import { rainChance, skyFromWords } from "@/lib/hero-readings";
import {
  defaultLocation,
  locationHref,
  type SiteLocation,
} from "@/lib/locations";

/** "Maurice Bishop International (MBIA)" → "MBIA". */
const STATION_CODE = /^.*\((.+)\)$/;

/**
 * Bold sky hero. One card on top for the selected tab (Now: what is measured
 * at the station; a day: its forecast), the tabs (Now, then each forecast
 * day), and the selected tab's details. Phones stack them; wider screens put
 * the card on the left and the tabs over the details on the right. Phones keep
 * one height on every tab so switching never jumps; wider screens are as short
 * as the selected tab's content. The gradient is the only one on the site;
 * small text always sits on `bg-gm-scrim` (the gradient's light stop is under
 * AA for small type).
 */
/**
 * The first tab's label and time. A reading older than 90 minutes says
 * "Last" over its time (or its weekday from an earlier day), never "Now"
 * (owner, 29 Oct 2026).
 */
function stripTime(
  observedAt: string | null,
  now?: Date
): { label: "Now" | "Last"; time: string | null } {
  if (!observedAt) return { label: "Now", time: null };
  if (!isStale(observedAt, now)) {
    return { label: "Now", time: localTime(observedAt) };
  }
  return {
    label: "Last",
    time: isOtherGrenadaDay(observedAt, now)
      ? localWeekday(observedAt)
      : localTime(observedAt),
  };
}

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
    (day, index) => {
      const issued = weather.days[index];
      return {
        ...day,
        href: day.path,
        rainWord: issued ? rainChance(issued) : null,
      };
    }
  );
  const wanted = selected === "today" ? days[0]?.slug : selected;
  const index = days.findIndex((day) => day.slug === wanted);
  const tab = days[index]?.slug ?? "now";
  const station = location.station.replace(STATION_CODE, "$1");
  const nowHref = locationHref(location, "/");
  const current = weather.current;
  const today = days[0];

  // Every tab's content is rendered up front so switching tabs needs no server trip.
  const cards: Record<string, React.ReactNode> = {
    now: (
      <NowCard
        current={current}
        fallbackTemperature={weather.observation?.temperature ?? null}
        now={now}
        station={station}
        today={
          today && weather.days[0] && today.high !== null
            ? {
                high: today.high,
                href: today.href,
                sky: today.condition,
                slug: today.slug,
              }
            : undefined
        }
      />
    ),
  };
  const panels: Record<string, React.ReactNode> = {
    now: <NowPanel weather={weather} />,
  };
  days.forEach((day, dayIndex) => {
    const issued = weather.days[dayIndex];
    if (!issued) return;
    cards[day.slug] = <DayCard condition={day.condition} day={issued} />;
    panels[day.slug] = (
      <DayPanel
        day={issued}
        note={location.isDefault ? undefined : weather.label}
      />
    );
  });

  return (
    <HeroSelectionProvider initial={tab}>
      <section
        aria-labelledby="sky-hero-title"
        className="bg-gm-gradient-sky text-gm-text-inverse"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 px-4 pt-2 pb-4 sm:px-6 lg:gap-2.5 lg:pt-3 lg:pb-6 xl:px-8">
          {/* The place is shown in the card; the heading is for screen readers. */}
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[25rem_minmax(0,1fr)] lg:gap-2.5">
            <div className="rounded-gm-card bg-gm-scrim px-4 py-3">
              {/* Units switch sits in the card's top corner on every tab: it
                  is the card header's control, not part of the day's words. */}
              <div className="-mt-2 -mr-2 flex justify-end">
                <UnitsToggle />
              </div>
              <ByTab fit panels={cards} />
            </div>
            <div className="grid min-w-0 content-start gap-2 lg:gap-2.5">
              <SkyDayStrip
                days={days}
                now={{
                  href: nowHref,
                  sky: skyFromWords(
                    current?.weather ??
                      current?.extra.find((t) => t.label === "Cloud")?.value ??
                      null
                  ),
                  temperature:
                    current?.temperature ??
                    weather.observation?.temperature ??
                    null,
                  ...stripTime(current?.observedAt ?? null, now),
                }}
              />
              <ByTab fit panels={panels} />
            </div>
          </div>

          {children}
        </div>
      </section>
    </HeroSelectionProvider>
  );
}
