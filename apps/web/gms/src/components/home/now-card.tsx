import { MapPinIcon } from "lucide-react";
import { ReadingGrid } from "@/components/home/reading-grid";
import { SkyScene } from "@/components/home/sky-scene";
import { SummaryCard } from "@/components/home/summary-card";
import { Temperature } from "@/components/measure";
import {
  isOtherGrenadaDay,
  isStale,
  localDay,
  localTime,
} from "@/lib/current-conditions";
import { feelsLike } from "@/lib/feels-like";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { nowReadings, skyFromWords } from "@/lib/hero-readings";
import { cn } from "@/lib/utils";

function Numeral({
  className,
  value,
}: {
  className?: string;
  value: number | null;
}) {
  return (
    <p className={cn("font-gm-display font-semibold tabular-nums", className)}>
      {value === null ? (
        <>
          —<span className="sr-only">No current temperature</span>
        </>
      ) : (
        <Temperature value={value} />
      )}
    </p>
  );
}

/**
 * When and where the reading was taken; an old reading says "Last observed"
 * and an unchecked one "provisional". A reading from another day carries its
 * date here. This one line is the hero's whole provenance; the full source
 * block lives on the observations page.
 */
function sourceLine(
  weather: WeatherSnapshot,
  station: string,
  now?: Date
): string {
  const current = weather.current;
  if (current) {
    const time = isOtherGrenadaDay(current.observedAt, now)
      ? `${localDay(current.observedAt)}, ${localTime(current.observedAt)}`
      : localTime(current.observedAt);
    const line = isStale(current.observedAt, now)
      ? `Last observed ${time} · ${station}`
      : `Observed ${time} · ${station}`;
    return current.provisional ? `${line} · provisional` : line;
  }
  return weather.observation
    ? `Midday reading · ${station}`
    : `No current observation · ${station}`;
}

/**
 * The latest MBIA register reading as a picture summary: when it was taken,
 * the temperature, what the sky is doing and how it feels, beside a small sky
 * scene. The midday product temperature stands in when there is no register
 * reading. `compact` is the size used inside the Now tab on wider screens.
 */
export function NowSummary({
  compact = false,
  now,
  station,
  weather,
}: {
  compact?: boolean;
  /** Clock for the stale-reading line; defaults to the render time. */
  now?: Date;
  station: string;
  weather: WeatherSnapshot;
}) {
  const current = weather.current;
  const temperature =
    current?.temperature ?? weather.observation?.temperature ?? null;
  const feels =
    current?.temperature == null ? null : (
      <>
        Feels like{" "}
        <Temperature value={feelsLike(current.temperature, current.humidity)} />
      </>
    );
  return (
    <SummaryCard
      condition={current?.weather ?? null}
      conditionPlaceholder="Sky not reported"
      label={
        <>
          <MapPinIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-2 min-w-0">
            {sourceLine(weather, station, now)}
          </span>
        </>
      }
      numeral={
        <Numeral
          className={compact ? "text-gm-numeral" : "text-gm-numeral-hero"}
          value={temperature}
        />
      }
      scene={
        <SkyScene
          className={compact ? "w-16 lg:w-24" : "w-28"}
          sky={skyFromWords(current?.weather ?? null)}
        />
      }
      secondary={feels}
      title={compact ? "Now" : undefined}
    />
  );
}

/** The Now tab's panel: every reading from the register, as a grid. */
export function NowPanel({ weather }: { weather: WeatherSnapshot }) {
  const current = weather.current;
  return (
    <section
      aria-label="Current conditions"
      className="rounded-gm-card bg-gm-scrim grid h-full content-start gap-3 px-4 py-3 lg:px-5"
    >
      {current ? (
        <ReadingGrid
          className="border-t-0 pt-0"
          readings={nowReadings(current)}
        />
      ) : (
        <p className="text-body-base leading-body-base font-bold">
          No current observation
        </p>
      )}
    </section>
  );
}
