"use client";

import {
  formatWeather,
  parseWeather,
  WEATHER_COVERAGE,
  WEATHER_PHENOMENA,
  type WeatherCoverage,
  type WeatherItem,
  type WeatherPhenomenonId,
} from "@barrelsgd/gms/weather-types";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { cn } from "@barrelsgd/ui/lib/utils";

/**
 * Weather types as a fixed checklist (owner decision 7, #1197). Each ticked
 * type that can be patchy takes a coverage word. Every option is its own row
 * so the choices stay clearly separated; the SYNOP and METAR codes stay
 * internal (`@barrelsgd/gms/weather-types`).
 */
export function ProductWeatherControl({
  error,
  id,
  label,
  onChange,
  value,
}: {
  error?: string;
  /** DOM id of the fieldset (error summary links focus here). */
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const items = parseWeather(value);
  const selected = new Map(items.map((item) => [item.id, item]));
  const update = (id: WeatherPhenomenonId, next: WeatherItem | null) => {
    const kept = WEATHER_PHENOMENA.flatMap((p) => {
      if (p.id === id) return next ? [next] : [];
      const item = selected.get(p.id);
      return item ? [item] : [];
    });
    onChange(formatWeather(kept));
  };
  const errorId = `${id}-error`;
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      className="col-span-full grid basis-full gap-2"
      id={id}
      tabIndex={-1}
    >
      <legend className="text-sm font-medium">{label}</legend>
      <ul className="divide-border grid divide-y rounded-lg border sm:grid-cols-2 sm:divide-y-0">
        {WEATHER_PHENOMENA.map((p) => {
          const item = selected.get(p.id);
          const boxId = `${id}-${p.id}`;
          return (
            <li
              className={cn(
                "flex min-h-10 flex-wrap items-center gap-2 px-3 py-1.5 sm:border-b",
                item && "bg-muted/40"
              )}
              key={p.id}
            >
              <label
                className="flex flex-1 cursor-pointer items-center gap-2 text-sm"
                htmlFor={boxId}
              >
                <Checkbox
                  checked={Boolean(item)}
                  id={boxId}
                  onCheckedChange={(checked) =>
                    update(p.id, checked === true ? { id: p.id } : null)
                  }
                />
                {p.label}
              </label>
              {item && p.coverage.length ? (
                <NativeSelect
                  aria-label={`${p.label}: coverage`}
                  onChange={(event) =>
                    update(p.id, {
                      id: p.id,
                      ...(event.target.value
                        ? { coverage: event.target.value as WeatherCoverage }
                        : {}),
                    })
                  }
                  size="sm"
                  value={item.coverage ?? ""}
                >
                  <NativeSelectOption value="">
                    No coverage word
                  </NativeSelectOption>
                  {p.coverage.map((word) => (
                    <NativeSelectOption key={word} value={word}>
                      {WEATHER_COVERAGE[word]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="text-destructive text-xs leading-4" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
