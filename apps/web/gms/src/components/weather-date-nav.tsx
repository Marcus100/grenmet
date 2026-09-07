"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getForecastDays } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import { weatherIcon } from "@/lib/weather-icons";

export function WeatherDateNav() {
  const pathname = usePathname();
  const days = getForecastDays();

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
            <span className="text-micro leading-micro">
              {day.isToday ? "12:00 PM" : day.dayName}
            </span>

            {/* Date and month sit on one line — stacking them made the strip
                tall enough to crowd the forecast panel on small screens. */}
            <span className="flex items-baseline gap-1">
              <span className="font-bold text-heading-sm leading-heading-sm">
                {day.date}
              </span>
              <span className="text-body-sm uppercase leading-body-sm">
                {day.month}
              </span>
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
              />
              <span className="text-caption leading-caption">
                <span
                  className={cn(
                    "font-semibold",
                    isActive ? "text-gm-navy" : "text-gm-text-primary"
                  )}
                >
                  {day.high}&deg;
                </span>{" "}
                <span className="text-gm-text-muted">{day.low}&deg;</span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
