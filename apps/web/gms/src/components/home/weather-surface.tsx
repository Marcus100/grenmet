import { Suspense } from "react";
import { LocationSwitcher } from "@/components/home/location-switcher";
import { SkyHero } from "@/components/home/sky-hero";
import { WarningTakeover } from "@/components/home/warning-takeover";
import { fetchActiveAlerts } from "@/lib/cap";
import { alertsForLocation, weatherForLocation } from "@/lib/location-data";
import type { SiteLocation } from "@/lib/locations";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";

/** The take-action band for one place, streamed in once the feed answers. */
async function LocationTakeover({ location }: { location: SiteLocation }) {
  const alerts = await fetchActiveAlerts();
  return <WarningTakeover alerts={alertsForLocation(alerts, location)} />;
}

/**
 * The top of every dated weather page for a place: a take-action takeover
 * when one is live for that place, then the sky hero with its switcher.
 * The hero never waits for the warning feed; the takeover streams in above it.
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
  /** `YYYY-MM-DD` of the day in the hero's panel, or `today`; Now when omitted. */
  selected?: string;
}) {
  const national = await getWeatherSnapshot();
  return (
    <>
      <Suspense fallback={null}>
        <LocationTakeover location={location} />
      </Suspense>
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
