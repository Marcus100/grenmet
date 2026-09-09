"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ForecastDay } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import { weatherIcon } from "@/lib/weather-icons";

export function WeatherDateNav({ days }: { days: ForecastDay[] }) {
  const pathname = usePathname();

  return (
    <div className="flex bg-gm-surface lg:w-32 lg:flex-none lg:flex-col lg:border-gm-border lg:border-r">
      {days.map((day) => {
        // Today is reachable both from the home page and from /forecasts;
        // every other day is /forecasts/YYYY/MM/DD.
        const href = day.isToday ? "/forecasts" : day.path;
        const isActive = day.isToday
          ? pathname === "/" || pathname === "/forecasts"
          : pathname === href;
        const Icon = weatherIcon(day.condition);
        const isSunny =
          day.condition === "sunny" || day.condition === "partly-cloudy";

        return (
          <Link
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center lg:py-3",
              isActive
                ? "border-2 border-gm-navy bg-background text-gm-navy lg:border-x-0 lg:border-t-0 lg:border-r-[3px] lg:border-r-gm-navy lg:border-b-0"
                : "bg-gm-surface text-gm-text-muted"
            )}
            href={href}
            key={day.slug}
          >
            {/* "Today" rather than an observation time: every other cell
                names a day, and the time now sits with Right now. */}
            <span className="text-caption leading-caption">{day.dayName}</span>

            {/* The month is dropped — a five-day strip never spans enough to
                need it, and the date carries the emphasis instead. */}
            <span className="font-bold text-heading-base leading-heading-base">
              {day.date}
            </span>

            {/* Icon beside the temperatures rather than above them. */}
            <span className="flex items-center gap-1.5">
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-5 shrink-0",
                  isSunny ? "text-gm-sun" : "text-gm-text-muted"
                )}
                strokeWidth={1.6}
                style={{ visibility: day.high === null ? "hidden" : "visible" }}
              />
              <span className="text-caption leading-caption">
                <span
                  className={cn(
                    "font-semibold",
                    isActive ? "text-gm-navy" : "text-gm-text-primary"
                  )}
                >
                  {day.high === null ? "—" : `${day.high}°`}
                </span>{" "}
                <span className="text-gm-text-muted">
                  {day.low === null ? "—" : `${day.low}°`}
                </span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
