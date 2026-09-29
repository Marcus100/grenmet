import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { SkyDayStrip } from "@/components/home/sky-day-strip";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { getForecastDays } from "@/lib/forecast-days";
import {
  defaultLocation,
  locationHref,
  type SiteLocation,
} from "@/lib/locations";
import { WEATHER_CONDITION_LABEL, weatherIcon } from "@/lib/weather-icons";

/** Up to four of today's issued figures, shown as facts under the reading. */
const FACT_COUNT = 4;

/**
 * Bold sky hero: the only gradient on the site. The largest element is the
 * latest MBIA temperature; small text always sits on `bg-gm-scrim` (the
 * gradient's light stop is under AA for small type).
 */
export function SkyHero({
  location = defaultLocation(),
  switcher,
  weather,
}: {
  location?: SiteLocation;
  /** Location switcher; rendered only when more than one place is enabled. */
  switcher?: React.ReactNode;
  weather: WeatherSnapshot;
}) {
  const today = weather.days[0];
  const Icon = weatherIcon(today.condition);
  const hasForecast = today.high !== null || today.low !== null;
  const facts = today.conditions.slice(0, FACT_COUNT);

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
          <p className="ml-auto rounded-md bg-gm-scrim px-2.5 py-1 text-body-sm leading-body-sm">
            {weather.observation?.observedAt ?? "No current observation"}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {hasForecast && (
                <Icon
                  aria-hidden="true"
                  className="size-14 shrink-0"
                  strokeWidth={1.4}
                />
              )}
              <p className="font-gm-display font-semibold text-gm-numeral-hero tabular-nums">
                {weather.observation ? (
                  <>
                    {Math.round(weather.observation.temperature)}°
                    <span className="sr-only">C, latest observation</span>
                  </>
                ) : (
                  <>
                    —<span className="sr-only">No current temperature</span>
                  </>
                )}
              </p>
              <div>
                <p className="font-bold font-gm-display text-heading-md uppercase leading-heading-md tracking-wide">
                  {hasForecast
                    ? WEATHER_CONDITION_LABEL[today.condition]
                    : "Forecast pending"}
                </p>
                <p className="mt-1 w-fit rounded-md bg-gm-scrim px-2 py-0.5 text-body tabular-nums leading-body">
                  High {today.high ?? "—"}° · Low {today.low ?? "—"}°
                </p>
              </div>
            </div>

            {facts.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-gm-card sm:grid-cols-4">
                {facts.map((fact) => (
                  <div className="bg-gm-scrim px-3 py-2.5" key={fact.label}>
                    <dt className="font-bold text-gm-text-inverse/85 text-label uppercase leading-label tracking-wider">
                      {fact.label}
                    </dt>
                    <dd className="mt-0.5 font-bold text-body-base tabular-nums leading-body-base">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="rounded-gm-card bg-gm-scrim p-4">
            <h2 className="font-bold text-gm-text-inverse/85 text-label uppercase leading-label tracking-wider">
              {today.title ?? "Today"}
            </h2>
            <p className="mt-2 text-body-base leading-body-base">
              {today.summary}
            </p>
            <p className="mt-3 text-body-sm text-gm-text-inverse/80 leading-body-sm">
              {weather.label}
            </p>
          </div>
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
