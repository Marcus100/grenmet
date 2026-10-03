import { MapPinIcon } from "lucide-react";
import Link from "next/link";
import {
  enabledLocations,
  LOCATIONS,
  locationHref,
  type SiteLocation,
} from "@/lib/locations";
import { cn } from "@/lib/utils";

/**
 * Chips for switching place, on the sky hero. Renders nothing while only one
 * place is enabled, so the site never offers a half-empty choice.
 */
export function LocationSwitcher({
  current,
  registry = LOCATIONS,
}: {
  current: SiteLocation;
  registry?: readonly SiteLocation[];
}) {
  const places = enabledLocations(registry);
  if (places.length < 2) {
    return null;
  }
  return (
    <nav aria-label="Choose a location">
      <ul className="flex flex-wrap gap-1.5">
        {places.map((place) => {
          const active = place.slug === current.slug;
          return (
            <li key={place.slug}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-1 rounded-full border px-3 font-semibold text-body-sm leading-body-sm outline-none focus-visible:ring-2 focus-visible:ring-gm-lime",
                  active
                    ? "border-gm-text-inverse bg-gm-text-inverse text-gm-navy"
                    : "border-gm-text-inverse/60 bg-gm-scrim"
                )}
                href={locationHref(place)}
              >
                {active && (
                  <MapPinIcon aria-hidden="true" className="size-3.5" />
                )}
                {place.shortName}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
