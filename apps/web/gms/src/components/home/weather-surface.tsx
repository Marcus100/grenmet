import { LocationSwitcher } from "@/components/home/location-switcher";
import { SkyHero } from "@/components/home/sky-hero";
import { WarningTakeover } from "@/components/home/warning-takeover";
import { fetchActiveAlerts } from "@/lib/cap";
import { alertsForLocation, weatherForLocation } from "@/lib/location-data";
import type { SiteLocation } from "@/lib/locations";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";

/**
 * The top of every dated weather page for a place: a take-action takeover
 * when one is live for that place, then the sky hero with its switcher.
 * Both fetches are React-cached, so pages can call them again below.
 */
export async function WeatherSurface({
  children,
  location,
  selected,
}: {
  /** Extra hero rows, forwarded to `SkyHero`. */
  children?: React.ReactNode;
  location: SiteLocation;
  /** `YYYY-MM-DD` of the day in the hero's panel; defaults to today. */
  selected?: string;
}) {
  const [alerts, national] = await Promise.all([
    fetchActiveAlerts(),
    getWeatherSnapshot(),
  ]);
  return (
    <>
      <WarningTakeover alerts={alertsForLocation(alerts, location)} />
      <SkyHero
        location={location}
        selected={selected}
        switcher={<LocationSwitcher current={location} />}
        weather={weatherForLocation(national, location)}
      >
        {children}
      </SkyHero>
    </>
  );
}
