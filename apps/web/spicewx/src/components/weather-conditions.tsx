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
    <div className="grid grid-cols-2 gap-gm-8 bg-background pt-2 pb-1">
      {conditions.map((item) => {
        const Icon = ICON_MAP[item.label];
        return (
          <div
            className="flex items-center gap-2 px-2.5 py-gm-8"
            key={item.label}
          >
            <div className="flex size-8 shrink-0 items-center justify-center">
              {Icon && (
                <Icon
                  className="h-5 w-5 text-gm-text-muted"
                  strokeWidth={1.5}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-px">
              <p className="font-semibold text-gm-body text-gm-text-primary leading-gm-label">
                {item.value}
              </p>
              <p className="text-gm-label text-gm-text-secondary leading-gm-caption">
                {item.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
