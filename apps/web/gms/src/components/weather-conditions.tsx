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
    <div className="grid grid-cols-2 gap-2 bg-background pt-2 pb-1 lg:grid-cols-5 lg:gap-0 lg:border-gm-border lg:border-t lg:pt-0 lg:pb-0">
      {conditions.map((item) => {
        const Icon = ICON_MAP[item.label];
        return (
          <div
            className="flex items-center gap-2 border-gm-border px-2.5 py-2 lg:flex-col lg:items-start lg:justify-center lg:gap-2.5 lg:border-r lg:border-b lg:px-4 lg:py-4.5"
            key={item.label}
          >
            <div className="flex size-8 shrink-0 items-center justify-center lg:size-auto">
              {Icon && (
                <Icon
                  className="h-5 w-5 text-gm-text-muted lg:h-6.5 lg:w-6.5"
                  strokeWidth={1.5}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-px">
              <p className="font-semibold text-body text-gm-text-primary leading-label lg:text-heading-sm lg:leading-heading-sm">
                {item.value}
              </p>
              <p className="text-gm-text-secondary text-label leading-caption lg:text-body-base lg:leading-body-base">
                {item.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
