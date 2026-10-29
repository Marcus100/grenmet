import type { ReactNode } from "react";
import { TabLink } from "@/components/home/hero-selection";
import { Measure, Temperature } from "@/components/measure";
import { clock12 } from "@/lib/clock";
import {
  type CurrentConditions,
  isOtherGrenadaDay,
  isStale,
  localDay,
  localTime,
} from "@/lib/current-conditions";
import { feelsLike } from "@/lib/feels-like";
import type { Condition, ForecastDayData } from "@/lib/forecast-data";
import { isIssued, rainChance } from "@/lib/hero-readings";
import type { Measure as MeasureValue } from "@/lib/units";
import {
  WEATHER_CONDITION_LABEL,
  type WeatherCondition,
} from "@/lib/weather-icons";

const byLabel = (tiles: Condition[], label: RegExp) =>
  tiles.find((tile) => label.test(tile.label));

const WIND = /^wind$/i;
const GUSTS = /^gusts/i;
const CLOUD = /^cloud$/i;
const HIGHEST = /^highest today/i;
const LOWEST = /^lowest today/i;
const WIND_SPEED = /^wind speed|^wind$/i;
const WIND_DIRECTION = /^wind direction/i;
const WEATHER_TYPE = /^weather type/i;

/** A figure in both unit systems, or its plain text when it has no numbers. */
function Figure({ tile }: { tile: Condition }) {
  return tile.measure ? <Measure measure={tile.measure} /> : tile.value;
}

/** "Wind ESE 28 km/h, gusts 45 km/h": the gusts only when recorded or issued. */
function WindLine({
  gusts,
  prefix,
  wind,
}: {
  gusts?: Condition;
  prefix?: string;
  wind?: Condition;
}) {
  if (!wind) return null;
  const measure: MeasureValue | undefined = wind.measure && {
    ...wind.measure,
    prefix: prefix ?? wind.measure.prefix,
  };
  return (
    <>
      Wind{" "}
      {measure ? (
        <Measure measure={measure} />
      ) : (
        [prefix?.trim(), wind.value].filter(Boolean).join(" ")
      )}
      {gusts && (
        <>
          , gusts <Figure tile={gusts} />
        </>
      )}
    </>
  );
}

/**
 * The hero's top card, one layout for Now and every forecast day so a tab
 * change only swaps the words: a small label, the big temperature with a
 * figure either side, the sky in words, one line of wind, then the
 * forecaster's sentence or a link. Missing items are left out (owner, 29 Oct
 * 2026), never shown as a dash.
 */
function HeroCard({
  footer,
  label,
  left,
  line,
  right,
  sky,
  temperature,
}: {
  footer?: ReactNode;
  label: ReactNode;
  left?: ReactNode;
  line?: ReactNode;
  right?: ReactNode;
  sky?: ReactNode;
  temperature: ReactNode;
}) {
  return (
    <section
      aria-label="Weather summary"
      className="flex h-full flex-col items-center justify-center gap-0.5 text-center"
    >
      <p className="font-bold text-body-sm text-gm-text-inverse/80 leading-body-sm">
        {label}
      </p>
      <div className="flex items-center gap-3.5 lg:gap-5">
        <span className="min-w-12 text-right font-bold text-body-lg tabular-nums leading-body-lg">
          {left}
        </span>
        <p className="font-gm-display font-semibold text-gm-numeral-hero tabular-nums">
          {temperature}
        </p>
        <span className="min-w-12 text-left font-bold text-body-lg tabular-nums leading-body-lg">
          {right}
        </span>
      </div>
      {sky && <p className="text-body-lg leading-body-lg">{sky}</p>}
      {line && (
        <p className="text-body-sm text-gm-text-inverse/90 leading-body-sm">
          {line}
        </p>
      )}
      {footer}
    </section>
  );
}

/** "▼ 26°" with the meaning spoken to screen readers. */
function Extreme({
  arrow,
  measure,
  spoken,
}: {
  arrow: "▲" | "▼";
  measure?: MeasureValue;
  spoken: string;
}) {
  if (!measure) return null;
  return (
    <>
      <span aria-hidden="true">{arrow} </span>
      <Measure measure={{ ...measure, bare: true, places: 0 }} />
      <span className="sr-only"> {spoken}</span>
    </>
  );
}

/** The day the Now card's link points to: today's forecast tab. */
export interface TodayLink {
  high: number | null;
  href: string;
  sky: WeatherCondition;
  slug: string;
}

/**
 * Now: what is measured at the station. The temperature with today's lowest
 * and highest so far either side, the sky (observer's words, else the cloud
 * amount), feels like and wind with gusts, and a link to today's forecast.
 */
export function NowCard({
  current,
  fallbackTemperature,
  now,
  station,
  today,
}: {
  current: CurrentConditions | null;
  /** Clock for the stale-reading label; defaults to the render time. */
  now?: Date;
  /** The midday product's temperature when there is no register reading. */
  fallbackTemperature: number | null;
  station: string;
  today?: TodayLink;
}) {
  const tiles = current ? [...current.primary, ...current.extra] : [];
  const temperature = current?.temperature ?? fallbackTemperature;
  const sky = current?.weather ?? byLabel(tiles, CLOUD)?.value ?? undefined;
  const wind = byLabel(tiles, WIND);
  const feels =
    current?.temperature == null
      ? null
      : feelsLike(current.temperature, current.humidity);
  // A fresh reading just says Now; an old one says when it was taken, never
  // passing for current (90-minute rule, `isStale`).
  let label = `Now · ${station}`;
  if (current && isStale(current.observedAt, now)) {
    const time = clock12(localTime(current.observedAt));
    const when = isOtherGrenadaDay(current.observedAt, now)
      ? `${localDay(current.observedAt)}, ${time}`
      : time;
    label = `Last observed ${when} · ${station}`;
  } else if (!current) {
    label =
      fallbackTemperature === null
        ? `No current observation · ${station}`
        : `Midday reading · ${station}`;
  }
  return (
    <HeroCard
      footer={
        today && (
          <TabLink
            className="mt-2 rounded-full bg-gm-text-inverse/12 px-3.5 py-2 font-bold text-body-sm leading-body-sm outline-none hover:bg-gm-text-inverse/20 focus-visible:ring-2 focus-visible:ring-gm-lime"
            currentClassName=""
            data-analytics-day="today"
            data-analytics-event="forecast_tab_selected"
            href={today.href}
            idleClassName=""
            slug={today.slug}
          >
            Today's forecast: {WEATHER_CONDITION_LABEL[today.sky]}
            {today.high !== null && (
              <>
                , high <Temperature value={today.high} />
              </>
            )}{" "}
            <span aria-hidden="true">→</span>
          </TabLink>
        )
      }
      label={label}
      left={
        <Extreme
          arrow="▼"
          measure={byLabel(tiles, LOWEST)?.measure}
          spoken="lowest so far today"
        />
      }
      line={
        (feels !== null || wind) && (
          <>
            {feels !== null && (
              <>
                Feels like <Temperature value={feels} />
              </>
            )}
            {feels !== null && wind && " · "}
            <WindLine gusts={byLabel(tiles, GUSTS)} wind={wind} />
          </>
        )
      }
      right={
        <Extreme
          arrow="▲"
          measure={byLabel(tiles, HIGHEST)?.measure}
          spoken="highest so far today"
        />
      }
      sky={sky}
      temperature={<Temperature value={temperature} />}
    />
  );
}

/** "Thu 29 Oct" for a forecast card's label. */
function shortDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  });
}

/**
 * A forecast day: the date, the low, the high and the chance of rain, the sky
 * as forecast, wind with gusts, then the forecaster's sentence for the day.
 */
export function DayCard({
  condition,
  day,
}: {
  condition: WeatherCondition;
  day: ForecastDayData;
}) {
  const label = shortDate(day.date);
  if (!isIssued(day)) {
    return (
      <HeroCard
        label={label}
        sky={<span className="text-gm-text-inverse/70">No forecast yet</span>}
        temperature="—"
      />
    );
  }
  const c = day.conditions;
  const direction = byLabel(c, WIND_DIRECTION)?.value;
  const rain = rainChance(day);
  return (
    <HeroCard
      footer={
        day.summary && (
          <p className="mt-1.5 max-w-sm text-balance font-bold text-body-base leading-body-base">
            {day.summary}
          </p>
        )
      }
      label={label}
      left={
        day.low !== null && (
          <>
            <span aria-hidden="true">▼ </span>
            <Temperature value={day.low} />
            <span className="sr-only"> lowest</span>
          </>
        )
      }
      line={
        <WindLine
          gusts={byLabel(c, GUSTS)}
          prefix={direction ? `${direction} ` : undefined}
          wind={byLabel(c, WIND_SPEED)}
        />
      }
      right={rain && <>Rain: {rain}</>}
      sky={
        byLabel(c, WEATHER_TYPE)?.value ?? WEATHER_CONDITION_LABEL[condition]
      }
      temperature={
        <>
          <Temperature value={day.high} />
          {day.high !== null && <span className="sr-only"> highest</span>}
        </>
      }
    />
  );
}
