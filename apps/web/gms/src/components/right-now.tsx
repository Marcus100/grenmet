import { CURRENT_CONDITIONS } from "@/lib/forecast-data";
import { weatherIcon } from "@/lib/weather-icons";

export function RightNow() {
  const Icon = weatherIcon(CURRENT_CONDITIONS.condition);

  return (
    <div>
      <span className="block pb-2.5 font-semibold text-gm-text-muted text-label uppercase tracking-wide">
        Right now
      </span>
      <div className="flex items-center gap-4 lg:gap-6">
        <Icon
          aria-hidden="true"
          className="size-16 shrink-0 text-gm-sun lg:size-18"
          strokeWidth={1.5}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-bold text-gm-text-primary text-heading-lg leading-heading-lg tracking-tight">
            {CURRENT_CONDITIONS.temperature}&deg;C
          </span>
          <span className="font-semibold text-gm-text-primary text-heading-sm leading-heading-sm">
            {CURRENT_CONDITIONS.conditionLabel}
          </span>
          <span className="text-body-sm text-gm-text-secondary leading-body-sm">
            Feels like {CURRENT_CONDITIONS.feelsLike}&deg; &middot;{" "}
            {CURRENT_CONDITIONS.wind}
          </span>
        </div>
      </div>
    </div>
  );
}
