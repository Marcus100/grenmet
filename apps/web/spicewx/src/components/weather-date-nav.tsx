"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getForecastDays } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";

export function WeatherDateNav() {
  const pathname = usePathname();
  const days = getForecastDays();

  return (
    <div className="flex h-[83px] bg-gm-surface">
      {days.map((day) => {
        const href = day.isToday ? "/" : `/${day.slug}`;
        const isActive = day.isToday ? pathname === "/" : pathname === href;

        return (
          <Link
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-gm-4 text-center",
              isActive
                ? "border-2 border-gm-navy bg-background px-[1.5px] py-[7.5px] text-gm-navy"
                : "bg-gm-surface py-1.5 text-gm-text-muted"
            )}
            href={href}
            key={day.slug}
          >
            <span className="text-gm-micro leading-gm-micro">
              {day.isToday ? "12:00 PM" : day.dayName}
            </span>
            <span className="font-bold text-gm-heading-lg leading-gm-heading-lg">
              {day.date}
            </span>
            <span className="text-gm-body-sm uppercase leading-[14px]">
              {day.month}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
