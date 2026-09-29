"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ForecastDay } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import { weatherIcon } from "@/lib/weather-icons";

/**
 * The forecast days as scrim tiles on the sky hero. Today is reachable at `/`
 * and `/weather`; every other day is `/weather/YYYY/MM/DD`. The selected day
 * gets a lime outline and `aria-current`.
 */
export function SkyDayStrip({
  days,
  todayHref = "/weather",
  todayPaths = ["/", "/weather"],
}: {
  days: ForecastDay[];
  /** Where "Today" links; prefixed for a non-default location. */
  todayHref?: string;
  /** Paths that count as today, for the current-day outline. */
  todayPaths?: readonly string[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Forecast days">
      <ul className="grid auto-cols-[minmax(5.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const href = day.isToday ? todayHref : day.path;
          const current = day.isToday
            ? todayPaths.includes(pathname)
            : pathname === href;
          const Icon = weatherIcon(day.condition);
          const missing = day.high === null && day.low === null;
          return (
            <li key={day.slug}>
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center gap-1 rounded-gm-card bg-gm-scrim px-2 py-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-gm-lime",
                  current && "ring-2 ring-gm-lime ring-inset"
                )}
                href={href}
              >
                <span className="font-bold text-body-sm leading-body-sm">
                  {day.isToday ? "Today" : day.dayName}
                </span>
                <span className="text-caption text-gm-text-inverse/85 leading-caption">
                  {day.date} {day.month}
                </span>
                <Icon
                  aria-hidden="true"
                  className={cn("size-7", missing && "invisible")}
                  strokeWidth={1.6}
                />
                <span className="font-bold text-body tabular-nums leading-body">
                  {day.high === null ? "—" : `${day.high}°`}{" "}
                  <span className="font-normal text-gm-text-inverse/80">
                    {day.low === null ? "—" : `${day.low}°`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
