import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Navigation,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Waves,
  Wind,
} from "lucide-react";
import type { Condition } from "@/lib/forecast-data";

const ICON_MAP: Record<string, LucideIcon> = {
  "Max Temp": Thermometer,
  "Min Temp": Thermometer,
  "Wind Speed": Wind,
  "Wind Direction": Navigation,
  "Rain Chance": Umbrella,
  "Sea State": Waves,
  "Wave Height": Waves,
  "Low Tide": ArrowDownToLine,
  "High Tide": ArrowUpToLine,
  Sunrise,
  Sunset,
  "Sunrise Today": Sunrise,
  "Sunrise Tomorrow": Sunrise,
  "Sunrise Sunday": Sunrise,
  "Sunset Today": Sunset,
};

interface WeatherConditionsProps {
  conditions: Condition[];
}

export function WeatherConditions({ conditions }: WeatherConditionsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 bg-white pt-2 pb-1">
      {conditions.map((item) => {
        const Icon = ICON_MAP[item.label];
        return (
          <div
            className="flex items-center gap-2 px-[10px] py-[8px]"
            key={item.label}
          >
            <div className="flex size-[30px] shrink-0 items-center justify-center">
              {Icon && (
                <Icon className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-px">
              <p className="font-semibold text-[14px] text-gray-900 leading-[16px]">
                {item.value}
              </p>
              <p className="text-[#4b5563] text-[11px] leading-[13px]">
                {item.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
