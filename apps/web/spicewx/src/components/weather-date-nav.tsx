"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getForecastDays } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";

export function WeatherDateNav() {
  const pathname = usePathname();
  const days = getForecastDays();

  return (
    <div className="flex border-gm-border border-b bg-white lg:flex-col lg:divide-y lg:divide-gm-border lg:border-gm-border lg:border-r lg:border-b-0">
      {days.map((day) => {
        const href = day.isToday ? "/" : `/${day.slug}`;
        const isActive = day.isToday ? pathname === "/" : pathname === href;
        return (
          <Link
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 border-b-2 py-3 text-center transition-colors",
              "lg:w-24 lg:flex-none lg:border-b-0 lg:border-l-4 lg:gap-1.5 lg:px-3",
              isActive
                ? "border-gm-blue text-gm-navy"
                : "border-transparent text-gray-400 hover:text-gm-navy",
            )}
            href={href}
            key={day.slug}
          >
            {day.isToday ? (
              <>
                <span className="font-bold text-base leading-none lg:text-2xl">
                  12:00 PM
                </span>
                <span className="font-bold text-base leading-none lg:text-2xl">
                  {day.date}
                </span>
                <span className="text-xs tracking-wide">{day.month}</span>
              </>
            ) : (
              <>
                <span className="text-xs tracking-wide">{day.dayName}</span>
                <span className="font-bold text-base leading-none lg:text-2xl">
                  {day.date}
                </span>
                <span className="text-xs tracking-wide">{day.month}</span>
              </>
            )}
          </Link>
        );
      })}
    </div>
  );
}
