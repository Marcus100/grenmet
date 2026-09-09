import { Thermometer } from "lucide-react";
import type { WeatherSnapshot } from "@/lib/forecast-data";
export function RightNow({
  observation,
}: {
  observation: WeatherSnapshot["observation"];
}) {
  return (
    <div>
      <span className="block pb-2.5 font-semibold text-gm-text-muted text-label uppercase tracking-wide">
        Latest available MBIA observation
      </span>
      {observation ? (
        <div className="flex items-center gap-4">
          <Thermometer aria-hidden="true" className="size-12 text-gm-blue" />
          <div>
            <p className="font-bold text-gm-text-primary text-heading-lg">
              {observation.temperature}°C
            </p>
            <p className="text-gm-text-secondary text-sm">
              {observation.observedAt}
            </p>
          </div>
        </div>
      ) : (
        <p>No current temperature observation is available.</p>
      )}
    </div>
  );
}
