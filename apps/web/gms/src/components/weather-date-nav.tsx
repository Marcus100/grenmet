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
    <div className="flex h-[83px] bg-gm-surface lg:h-auto lg:w-26 lg:flex-none lg:flex-col lg:border-gm-border lg:border-r">
      {days.map((day) => {
        const href = day.isToday ? "/" : `/${day.slug}`;
        const isActive = day.isToday ? pathname === "/" : pathname === href;
        const Icon = weatherIcon(day.condition);
        const isSunny =
          day.condition === "sunny" || day.condition === "partly-cloudy";

        return (
          <Link
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-center lg:gap-0.5 lg:py-3",
              isActive
                ? "border-2 border-gm-navy bg-background px-[1.5px] py-[7.5px] text-gm-navy lg:border-x-0 lg:border-t-0 lg:border-r-[3px] lg:border-r-gm-navy lg:border-b-0 lg:bg-background lg:px-0 lg:py-3"
                : "bg-gm-surface py-1.5 text-gm-text-muted"
            )}
            href={href}
            key={day.slug}
          >
            <span className="text-micro leading-micro">
              {day.isToday ? "12:00 PM" : day.dayName}
            </span>
            <span className="font-bold text-heading-lg leading-heading-lg">
              {day.date}
            </span>
            <span className="text-body-sm uppercase leading-[14px]">
              {day.month}
            </span>
            <Icon
              aria-hidden="true"
              className={cn(
                "size-6 shrink-0",
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
          </Link>
        );
      })}
    </div>
  );
}
