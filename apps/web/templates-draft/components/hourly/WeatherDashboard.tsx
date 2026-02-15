import type { LucideIcon } from "lucide-react";
import {
  AirVent,
  Cloud,
  CloudRain,
  Droplet,
  Eye,
  Flower2,
  Gauge,
  Info,
  Percent,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
} from "lucide-react";

interface WeatherMetric {
  label: string;
  value: string;
  icon: LucideIcon;
  showInfo?: boolean;
}

const leftColumnMetrics: WeatherMetric[] = [
  {
    label: "Precipitation",
    value: "-",
    icon: Percent,
  },
  {
    label: "Feels Like",
    value: "28°",
    icon: Thermometer,
  },
  {
    label: "Dew Point",
    value: "23°",
    icon: Droplet,
  },
  {
    label: "UV Index",
    value: "0",
    icon: Sun,
  },
  {
    label: "Cloud Cover",
    value: "59%",
    icon: Cloud,
  },
  {
    label: "Sunrise",
    value: "6:22 am",
    icon: Sunrise,
  },
  {
    label: "Air Quality",
    value: "Good",
    icon: Flower2,
    showInfo: true,
  },
];

const rightColumnMetrics: WeatherMetric[] = [
  {
    label: "Rain",
    value: "0.0 mm",
    icon: CloudRain,
  },
  {
    label: "Pressure",
    value: "1013.21 mb",
    icon: Gauge,
  },
  {
    label: "Humidity",
    value: "84%",
    icon: Droplet,
  },
  {
    label: "Visibility",
    value: "9.66 km",
    icon: Eye,
  },
  {
    label: "Wind",
    value: "E 8 kph",
    icon: Wind,
  },
  {
    label: "Sunset",
    value: "5:48 pm",
    icon: Sunset,
  },
  {
    label: "AQI",
    value: "26",
    icon: AirVent,
  },
];

interface MetricItemProps {
  metric: WeatherMetric;
}

function MetricItem({ metric }: MetricItemProps) {
  const Icon = metric.icon;
  return (
    <div className="flex items-center gap-4">
      {/* Icon with circular background - using light gray shades for contrast */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 ring-1 ring-zinc-200 ring-inset">
        <Icon className="h-5 w-5 text-zinc-700" strokeWidth={1.75} />
      </div>

      {/* Value and label - hierarchy through size and weight */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-2xl text-zinc-900 tracking-tight">
            {metric.value}
          </span>
          {metric.showInfo && (
            <Info
              className="h-3.5 w-3.5 shrink-0 text-zinc-500"
              strokeWidth={2.5}
            />
          )}
        </div>
        <span className="font-medium text-xs text-zinc-600 uppercase tracking-wide">
          {metric.label}
        </span>
      </div>
    </div>
  );
}

interface WeatherDashboardProps {
  title?: string;
}

export default function WeatherDashboard({
  title = "Showers in the Vicinity",
}: WeatherDashboardProps) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      {/* Header - size and weight create hierarchy */}
      <h2 className="mb-8 font-semibold text-xl text-zinc-900 tracking-tight">
        {title}
      </h2>

      {/* Two-column grid - consistent spacing scale */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {leftColumnMetrics.map((metric) => (
            <MetricItem key={metric.label} metric={metric} />
          ))}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {rightColumnMetrics.map((metric) => (
            <MetricItem key={metric.label} metric={metric} />
          ))}
        </div>
      </div>
    </div>
  );
}
