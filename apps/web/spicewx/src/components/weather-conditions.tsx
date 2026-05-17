import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Condition, Warning } from "@/lib/forecast-data";
import { cn } from "@/lib/utils";

interface WeatherConditionsProps {
  conditions: Condition[];
  title: string;
  warnings: Warning[];
}

export function WeatherConditions({
  title,
  conditions,
  warnings,
}: WeatherConditionsProps) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="flex-1 p-4 lg:p-5">
        <h2 className="mb-4 font-bold text-gm-blue text-sm uppercase tracking-widest">
          {title}
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-3 lg:gap-x-6">
          {conditions.map((item) => (
            <div className="flex items-center gap-3" key={item.label}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gm-surface text-gm-blue text-xs">
                icon
              </div>
              <div>
                <p className="font-bold text-gm-navy text-sm">{item.value}</p>
                <p className="text-gray-500 text-xs">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden w-64 shrink-0 flex-col lg:flex">
        <a
          className="flex items-center justify-between bg-gm-risk-amber px-4 py-3 font-semibold text-gray-900 text-sm"
          href="/warnings"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Current warnings
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </a>
        <div className="flex-1 divide-y divide-white/10 bg-gm-navy">
          {warnings.map((w) => (
            <div className="flex items-center gap-3 px-4 py-3" key={w.region}>
              <span
                className={cn(
                  "w-4 shrink-0 font-bold text-sm tabular-nums",
                  w.count > 0 ? "text-gm-risk-amber" : "text-white/30"
                )}
              >
                {w.count}
              </span>
              <span
                className={cn(
                  "text-sm",
                  w.count > 0 ? "text-white" : "text-white/50"
                )}
              >
                {w.region}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
