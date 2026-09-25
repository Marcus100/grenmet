import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Compass,
  Eye,
  Navigation,
  Ship,
  Sunrise,
  Sunset,
  Thermometer,
  ThermometerSnowflake,
  ThermometerSun,
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

/** Icon names sent by the forecast feed (`src/wxproducts/presentation.py`). */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  "thermometer-sun": ThermometerSun,
  "thermometer-snowflake": ThermometerSnowflake,
  wind: Wind,
  compass: Compass,
  umbrella: Umbrella,
  waves: Waves,
  ship: Ship,
  "arrow-up-to-line": ArrowUpToLine,
  "arrow-down-to-line": ArrowDownToLine,
  sunrise: Sunrise,
  sunset: Sunset,
  eye: Eye,
};

interface WeatherConditionsProps {
  conditions: Condition[];
}

export function WeatherConditions({ conditions }: WeatherConditionsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 bg-background p-2.5 lg:grid-cols-5 lg:gap-4 lg:p-4">
      {conditions.map((item, index) => {
        const Icon =
          (item.icon ? ICON_BY_NAME[item.icon] : undefined) ??
          ICON_MAP[item.label];
        return (
          <div
            className="flex items-center gap-3 rounded-2xl border border-gm-border bg-background p-4"
            key={`${index}-${item.label}`}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gm-surface">
              {Icon && (
                <Icon
                  className="h-5 w-5 text-gm-text-muted"
                  strokeWidth={1.75}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-semibold text-body-base text-gm-text-primary leading-body-base lg:text-heading-sm lg:leading-heading-sm">
                {item.value}
              </p>
              <p className="text-body-sm text-gm-text-secondary leading-body-sm lg:text-body-base lg:leading-body-base">
                {item.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
