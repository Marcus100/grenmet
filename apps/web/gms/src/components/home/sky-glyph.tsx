import { cn } from "@/lib/utils";
import type { WeatherCondition } from "@/lib/weather-icons";

const CLOUD =
  "M7 19a4.5 4.5 0 0 1-.4-8.98A6 6 0 0 1 18 9.5a4 4 0 0 1 .5 7.97V19Z";
const RAYS =
  "M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6";

/**
 * A filled, picture-like sky icon for the hero's day tabs: a white cloud,
 * a cloud with blue rain, the sun behind a cloud, or the sun. Decorative:
 * the tab says the sky in words for screen readers.
 */
export function SkyGlyph({
  className,
  sky,
}: {
  className?: string;
  sky: WeatherCondition;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("text-gm-text-inverse shrink-0", className)}
      viewBox="0 0 24 24"
    >
      {sky === "cloudy" && (
        <path d={CLOUD} fill="currentColor" transform="translate(0 -1)" />
      )}
      {sky === "showers" && (
        <>
          <path d={CLOUD} fill="currentColor" transform="translate(0 -4)" />
          <path
            d="M8 17.5l-1 2.6M12 17.5l-1 2.6M16 17.5l-1 2.6"
            fill="none"
            stroke="var(--gm-sky)"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </>
      )}
      {sky === "partly-cloudy" && (
        <>
          <circle cx="15.5" cy="7.5" fill="var(--gm-risk-yellow)" r="4.2" />
          <path
            d={CLOUD}
            fill="currentColor"
            transform="translate(-1.5 1) scale(.92)"
          />
        </>
      )}
      {sky === "sunny" && (
        <>
          <circle cx="12" cy="12" fill="var(--gm-risk-yellow)" r="5" />
          <path
            d={RAYS}
            stroke="var(--gm-risk-yellow)"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}
