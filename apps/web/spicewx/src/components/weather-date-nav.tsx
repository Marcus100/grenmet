"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getForecastDays } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";

export function WeatherDateNav() {
  const pathname = usePathname();
  const days = getForecastDays();

  return (
    <div className="flex h-[83px] bg-[#f3f4f6]">
      {days.map((day) => {
        const href = day.isToday ? "/" : `/${day.slug}`;
        const isActive = day.isToday ? pathname === "/" : pathname === href;

        return (
          <Link
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-[4px] text-center",
              isActive
                ? "border-[1.5px] border-gm-navy bg-white px-[1.5px] py-[7.5px] text-gm-navy"
                : "bg-[#f3f4f6] py-[6px] text-gray-500"
            )}
            href={href}
            key={day.slug}
          >
            <span className="text-[10px] leading-[16px]">
              {day.isToday ? "12:00 PM" : day.dayName}
            </span>
            <span className="font-bold text-[34px] leading-[36px]">
              {day.date}
            </span>
            <span className="text-[13px] uppercase leading-[14px]">
              {day.month}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
