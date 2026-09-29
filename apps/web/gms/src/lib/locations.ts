/**
 * Places the public site can be personalised for. Internally a place is keyed
 * by its airport location indicator (ICAO); publicly it has a readable URL
 * slug. The default place lives at the unprefixed URLs (`/`, `/weather`);
 * every other enabled place gets a prefix (`/carriacou`, `/carriacou/weather`).
 *
 * To add a place: add an entry here, wire its data (station observation,
 * forecast, marine), then set `enabled: true`. Until a second place is
 * enabled the switcher stays hidden and prefixed URLs are 404s.
 */
export interface SiteLocation {
  /** Names that mark an alert as covering this place (CAP `areas`). */
  alertAreas: readonly string[];
  enabled: boolean;
  icao: string;
  isDefault: boolean;
  name: string;
  /** Short label for the switcher. */
  shortName: string;
  slug: string;
  /** Observation station shown in the hero. */
  station: string;
}

export const LOCATIONS: readonly SiteLocation[] = [
  {
    slug: "grenada",
    icao: "TGPY",
    name: "Grenada",
    shortName: "Grenada",
    station: "Maurice Bishop International (MBIA)",
    alertAreas: ["Grenada"],
    enabled: true,
    isDefault: true,
  },
  {
    slug: "carriacou",
    icao: "TGPZ",
    name: "Carriacou & Petite Martinique",
    shortName: "Carriacou & PM",
    station: "Lauriston, Carriacou",
    alertAreas: ["Carriacou", "Petite Martinique"],
    // No local observation or forecast yet: hidden until its data is wired.
    enabled: false,
    isDefault: false,
  },
];

/** Names used for alerts that cover the whole state. */
const NATIONAL_AREAS = [
  "Grenada, Carriacou and Petite Martinique",
  "Tri-island state",
];

export function enabledLocations(
  registry: readonly SiteLocation[] = LOCATIONS
): SiteLocation[] {
  return registry.filter((location) => location.enabled);
}

export function defaultLocation(
  registry: readonly SiteLocation[] = LOCATIONS
): SiteLocation {
  const found = registry.find((location) => location.isDefault);
  if (!found) {
    throw new Error("LOCATIONS needs exactly one default location");
  }
  return found;
}

/** An enabled location by URL slug; disabled or unknown slugs are undefined. */
export function locationBySlug(
  slug: string,
  registry: readonly SiteLocation[] = LOCATIONS
): SiteLocation | undefined {
  return enabledLocations(registry).find((location) => location.slug === slug);
}

/** Static params for the prefixed routes: enabled, non-default places only. */
export function prefixedLocationParams(
  registry: readonly SiteLocation[] = LOCATIONS
): { location: string }[] {
  return enabledLocations(registry)
    .filter((location) => !location.isDefault)
    .map((location) => ({ location: location.slug }));
}

/** The URL of `path` for a place: unprefixed for the default place. */
export function locationHref(location: SiteLocation, path = "/"): string {
  if (location.isDefault) {
    return path;
  }
  return path === "/" ? `/${location.slug}` : `/${location.slug}${path}`;
}

/**
 * Does an alert concern this place? National alerts (no areas, or the whole
 * state) always do; otherwise one of its areas must name the place.
 */
export function alertCoversLocation(
  areas: readonly string[],
  location: SiteLocation
): boolean {
  if (areas.length === 0) {
    return true;
  }
  return areas.some((area) => {
    const text = area.toLowerCase();
    return (
      NATIONAL_AREAS.some((national) =>
        text.includes(national.toLowerCase())
      ) || location.alertAreas.some((name) => text.includes(name.toLowerCase()))
    );
  });
}
