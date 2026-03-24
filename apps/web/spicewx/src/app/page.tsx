import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Droplets,
  Eye,
  Gauge,
  Globe,
  Info,
  MapPin,
  Plane,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { ForecastTabs } from "@/components/forecast-tabs";
import { SmallWeatherIcon, WeatherIcon } from "@/components/weather-icon";
import { cn } from "@/lib/utils";

/* ── Static weather data (replace with live API calls) ─────────────── */

const current = {
  location: "Point Salines",
  region: "Grenada",
  temp: 27,
  feelsLike: 31,
  condition: "partly-cloudy" as const,
  conditionLabel: "Partly Cloudy",
  humidity: 82,
  dewPoint: 24,
  uvIndex: 11,
  uvLabel: "Very High",
  wind: { speed: 18, gust: 25, dir: "ENE" },
  visibility: 25,
  pressure: {
    value: 1013,
    trend: "falling" as "rising" | "falling" | "steady",
  },
  updatedAt: "12:30 PM AST",
};

const alerts = [
  {
    id: 1,
    type: "advisory" as const,
    title: "Small Craft Advisory",
    body: "Seas 2–3 m, winds ENE 20–30 kt. Mariners urged to exercise caution.",
    expires: "8:00 PM AST",
  },
  {
    id: 2,
    type: "watch" as const,
    title: "UV Advisory",
    body: "UV index reaching 11 (Very High). Limit unprotected sun exposure 10 AM–3 PM.",
    expires: "3:00 PM AST",
  },
];

const fiveDay = [
  {
    day: "Today",
    condition: "partly-cloudy" as const,
    high: 29,
    low: 23,
    pop: 40,
  },
  { day: "Tue", condition: "sunny" as const, high: 30, low: 24, pop: 10 },
  { day: "Wed", condition: "rain" as const, high: 27, low: 22, pop: 70 },
  {
    day: "Thu",
    condition: "partly-cloudy" as const,
    high: 28,
    low: 23,
    pop: 30,
  },
  { day: "Fri", condition: "sunny" as const, high: 30, low: 24, pop: 5 },
];

const products = [
  {
    id: 1,
    icon: Waves,
    title: "Marine Bulletin",
    summary:
      "Seas ENE 2–3 m. Winds 20–30 kt. Small Craft Advisory in effect. Next update 6:00 PM.",
    issued: "Mon 23 Mar, 9:00 AM",
    href: "#",
    accent: "sky",
  },
  {
    id: 2,
    icon: Globe,
    title: "Tropical Weather Outlook",
    summary:
      "No tropical cyclone activity expected in the eastern Caribbean basin over the next 5 days.",
    issued: "Mon 23 Mar, 8:00 AM",
    href: "#",
    accent: "emerald",
  },
  {
    id: 3,
    icon: BarChart3,
    title: "Climate Bulletin",
    summary:
      "March 2026 temperatures tracking 0.8°C above the 1991–2020 average. Rainfall slightly below normal.",
    issued: "Mon 23 Mar, 7:00 AM",
    href: "#",
    accent: "violet",
  },
  {
    id: 4,
    icon: Plane,
    title: "Aviation METAR",
    summary: "TGPY 231230Z 07018KT 9999 FEW025 27/24 A2993 NOSIG",
    issued: "Mon 23 Mar, 12:30 PM",
    href: "#",
    accent: "amber",
  },
];

/* ── Helpers ───────────────────────────────────────────────────────── */

const alertStyles = {
  advisory: {
    border: "border-amber-400/60",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: "text-amber-500",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  watch: {
    border: "border-blue-400/60",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: "text-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
  warning: {
    border: "border-red-400/60",
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: "text-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
};

const productAccent: Record<string, string> = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const uvColor = (idx: number) => {
  if (idx <= 2) return "text-green-600";
  if (idx <= 5) return "text-yellow-500";
  if (idx <= 7) return "text-orange-500";
  if (idx <= 10) return "text-red-500";
  return "text-purple-600";
};

function pressureTrendIcon(trend: "rising" | "falling" | "steady") {
  if (trend === "rising") return "↑";
  if (trend === "falling") return "↓";
  return "→";
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function WeatherPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Current conditions + sidebar ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Current weather card */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 via-sky-700 to-sky-800 shadow-sky-900/30 shadow-xl">
            {/* Location bar */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div className="flex items-center gap-2 text-sky-100">
                <MapPin className="size-4 shrink-0" />
                <span className="font-semibold text-lg text-white">
                  {current.location}
                </span>
                <span className="text-sky-300">·</span>
                <span className="text-sky-200 text-sm">{current.region}</span>
              </div>
              <span className="text-sky-300 text-xs">
                Updated {current.updatedAt}
              </span>
            </div>

            {/* Main temp + icon */}
            <div className="flex flex-col items-center gap-6 px-6 py-4 sm:flex-row sm:items-start">
              <WeatherIcon
                className="size-32 shrink-0"
                condition={current.condition}
              />
              <div className="text-center sm:text-left">
                <div className="flex items-start justify-center sm:justify-start">
                  <span className="font-thin text-8xl text-white leading-none">
                    {current.temp}
                  </span>
                  <span className="mt-4 font-light text-4xl text-sky-200">
                    °C
                  </span>
                </div>
                <p className="mt-1 font-medium text-sky-100 text-xl">
                  {current.conditionLabel}
                </p>
                <p className="mt-1 text-sky-300 text-sm">
                  Feels like {current.feelsLike}°C
                </p>
              </div>
            </div>

            {/* Metric pills */}
            <div className="mt-2 px-6 pb-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  {
                    icon: Droplets,
                    label: "Humidity",
                    value: `${current.humidity}%`,
                  },
                  {
                    icon: Thermometer,
                    label: "Dew Point",
                    value: `${current.dewPoint}°C`,
                  },
                  {
                    icon: Wind,
                    label: "Wind",
                    value: `${current.wind.dir} ${current.wind.speed} mph`,
                    sub: `Gusts ${current.wind.gust} mph`,
                  },
                  {
                    icon: Eye,
                    label: "Visibility",
                    value: `${current.visibility} km`,
                  },
                  {
                    icon: Gauge,
                    label: "Pressure",
                    value: `${current.pressure.value} mb`,
                    sub: pressureTrendIcon(current.pressure.trend),
                  },
                  {
                    icon: null,
                    label: "UV Index",
                    value: `${current.uvIndex}`,
                    sub: current.uvLabel,
                    valueClass: uvColor(current.uvIndex),
                  },
                ].map(({ icon: Icon, label, value, sub, valueClass }) => (
                  <div
                    className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm"
                    key={label}
                  >
                    {Icon && <Icon className="size-5 shrink-0 text-sky-300" />}
                    {!Icon && (
                      <div className="flex size-5 shrink-0 items-center justify-center text-sky-300">
                        <span className="font-bold text-xs">UV</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sky-300 text-xs">{label}</p>
                      <p
                        className={cn(
                          "font-semibold text-sm text-white",
                          valueClass
                        )}
                      >
                        {value}
                      </p>
                      {sub && <p className="text-[11px] text-sky-300">{sub}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar: Alerts + 5-day */}
        <div className="flex flex-col gap-4">
          {/* Active alerts */}
          {alerts.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-border border-b px-5 py-4">
                <AlertTriangle className="size-4 text-amber-500" />
                <h2 className="font-semibold text-foreground text-sm">
                  Active Alerts
                </h2>
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-300">
                  {alerts.length}
                </span>
              </div>
              <div className="divide-y divide-border">
                {alerts.map((alert) => {
                  const s = alertStyles[alert.type];
                  return (
                    <div className={cn("px-5 py-4", s.bg)} key={alert.id}>
                      <div className="flex items-start gap-3">
                        <Info
                          className={cn("mt-0.5 size-4 shrink-0", s.icon)}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">
                              {alert.title}
                            </span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide",
                                s.badge
                              )}
                            >
                              {alert.type}
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                            {alert.body}
                          </p>
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            Expires: {alert.expires}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5-day forecast */}
          <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-border border-b px-5 py-4">
              <h2 className="font-semibold text-foreground text-sm">
                5-Day Forecast
              </h2>
            </div>
            <div className="divide-y divide-border">
              {fiveDay.map((day) => (
                <div
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                  key={day.day}
                >
                  <span className="w-10 shrink-0 font-medium text-foreground text-sm">
                    {day.day}
                  </span>
                  <SmallWeatherIcon
                    className="text-xl"
                    condition={day.condition}
                  />
                  <div className="min-w-0 flex-1">
                    {day.pop > 20 && (
                      <span className="font-medium text-blue-500 text-xs">
                        {day.pop}%
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="font-semibold text-foreground">
                      {day.high}°
                    </span>
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-amber-400"
                        style={{ width: `${((day.high - 20) / 14) * 100}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground">{day.low}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hourly / weekly forecast tabs ────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
          <span>Detailed Forecast</span>
        </h2>
        <ForecastTabs />
      </div>

      {/* ── Weather products ──────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 font-semibold text-foreground text-lg">
          Weather Products & Bulletins
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <a
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                href={product.href}
                key={product.id}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl",
                      productAccent[product.accent]
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-semibold text-foreground text-sm leading-tight transition-colors group-hover:text-primary">
                    {product.title}
                  </h3>
                </div>
                <p className="flex-1 text-muted-foreground text-xs leading-relaxed">
                  {product.summary}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {product.issued}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
