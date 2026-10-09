import { ReadingGrid } from "@/components/home/reading-grid";
import { SkyScene } from "@/components/home/sky-scene";
import { isStale, localTime } from "@/lib/current-conditions";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { nowReadings, skyFromWords } from "@/lib/hero-readings";
import { feelsLike } from "@/lib/hero-samples";
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
        <>
          {Math.round(value)}°<span className="sr-only">C</span>
        </>
      )}
    </p>
  );
}

/** When and where the reading was taken; an old reading says "Last observed". */
function sourceLine(
  weather: WeatherSnapshot,
  station: string,
  now?: Date
): string {
  const current = weather.current;
  if (current) {
    const time = localTime(current.observedAt);
    return isStale(current.observedAt, now)
      ? `Last observed ${time} · ${station}`
      : `Observed ${time} · ${station}`;
  }
  return weather.observation ? "Midday reading" : "No current observation";
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
    current?.temperature == null
      ? null
      : `Feels like ${Math.round(feelsLike(current.temperature, current.humidity))}°`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="grid min-w-0 content-start gap-0.5">
        {compact && (
          <span className="font-bold text-body-base leading-body-base lg:text-heading-sm lg:leading-heading-sm">
            Now
          </span>
        )}
        <span className="truncate text-body-sm text-gm-text-inverse/85 leading-body-sm">
          {sourceLine(weather, station, now)}
        </span>
        <Numeral
          className={cn(
            "mt-1",
            compact ? "text-gm-numeral" : "text-gm-numeral-hero"
          )}
          value={temperature}
        />
        {current?.weather && (
          <span className="truncate font-bold text-body-base leading-body-base lg:text-heading-sm lg:leading-heading-sm">
            {current.weather}
          </span>
        )}
        {feels && (
          <span className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
            {feels}
          </span>
        )}
      </div>
      <SkyScene
        className={compact ? "w-16 lg:w-24" : "w-28"}
        sky={skyFromWords(current?.weather ?? null)}
      />
    </div>
  );
}

/** The Now tab's panel: every reading from the register, as a grid. */
export function NowPanel({ weather }: { weather: WeatherSnapshot }) {
  const current = weather.current;
  return (
    <section
      aria-label="Current conditions"
      className="grid content-start gap-3 rounded-gm-card bg-gm-scrim p-4 lg:p-5"
    >
      {current ? (
        <ReadingGrid
          className="border-t-0 pt-0"
          readings={nowReadings(current)}
        />
      ) : (
        <p className="font-bold text-body-base leading-body-base">
          No current observation
        </p>
      )}
    </section>
  );
}
