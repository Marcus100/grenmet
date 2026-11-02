import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationSwitcher } from "@/components/home/location-switcher";
import { SkyHero } from "@/components/home/sky-hero";
import type { AlertsResult, PublicAlert } from "@/lib/cap-alerts";
import { REFERENCE_WEATHER } from "@/lib/forecast-data";
import { alertsForLocation, weatherForLocation } from "@/lib/location-data";
import {
  alertCoversLocation,
  defaultLocation,
  enabledLocations,
  LOCATIONS,
  locationBySlug,
  locationHref,
  prefixedLocationParams,
  type SiteLocation,
} from "@/lib/locations";

/** Only Grenada enabled: the registry as it was before Carriacou went live. */
const ONLY_GRENADA: SiteLocation[] = LOCATIONS.map((location) => ({
  ...location,
  enabled: location.isDefault,
}));
const GRENADA = defaultLocation(LOCATIONS);
const CARRIACOU = LOCATIONS.find((l) => l.slug === "carriacou") as SiteLocation;
const STATION_NAME = /Lauriston/;
const MBIA_NAME = /MBIA/;
const NATIONAL_LABEL = /^National forecast for Grenada, Carriacou/;
const GRENADA_STATION_LINE = /^Now · MBIA$|^Midday reading · MBIA$/;

function alert(areas: string[], identifier: string): PublicAlert {
  return {
    areas,
    event: "Flood Warning",
    expires: null,
    headline: "Flooding",
    identifier,
    severity: "Moderate",
    status: "Actual",
  };
}

describe("only Grenada enabled", () => {
  it("serves no prefixed location routes and hides the switcher", () => {
    expect(enabledLocations(ONLY_GRENADA).map((l) => l.slug)).toEqual([
      "grenada",
    ]);
    expect(prefixedLocationParams(ONLY_GRENADA)).toEqual([]);
    expect(locationBySlug("carriacou", ONLY_GRENADA)).toBeUndefined();
    const { container } = render(
      <LocationSwitcher
        current={defaultLocation(ONLY_GRENADA)}
        registry={ONLY_GRENADA}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Carriacou is enabled", () => {
  it("serves its routes from the live registry", () => {
    expect(enabledLocations().map((l) => l.slug)).toEqual([
      "grenada",
      "carriacou",
    ]);
    expect(prefixedLocationParams()).toEqual([{ location: "carriacou" }]);
    expect(locationBySlug("carriacou")).toBe(CARRIACOU);
  });

  it("has no observing station", () => {
    expect(CARRIACOU.station).toBeNull();
    expect(GRENADA.station).toContain("MBIA");
  });
});

describe("with a second place enabled", () => {
  it("prefixes every place but the default", () => {
    expect(prefixedLocationParams(LOCATIONS)).toEqual([
      { location: "carriacou" },
    ]);
    expect(locationHref(GRENADA, "/weather")).toBe("/weather");
    expect(locationHref(CARRIACOU)).toBe("/carriacou");
    expect(locationHref(CARRIACOU, "/weather")).toBe("/carriacou/weather");
  });

  it("shows a switcher that marks the current place", () => {
    render(<LocationSwitcher current={CARRIACOU} registry={LOCATIONS} />);
    expect(
      screen.getByRole("link", { name: "Carriacou & PM" })
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Grenada" })).toHaveAttribute(
      "href",
      "/"
    );
  });
});

describe("alerts for a place", () => {
  const alerts: AlertsResult = {
    status: "ok",
    activeCount: 3,
    groups: [
      {
        name: "Flood",
        alerts: [
          alert(["Grenada"], "g"),
          alert(["Carriacou"], "c"),
          alert([], "national"),
        ],
      },
    ],
  };

  it("keeps national alerts and those naming the place", () => {
    expect(alertCoversLocation(["Petite Martinique"], CARRIACOU)).toBe(true);
    expect(
      alertCoversLocation(
        ["Grenada, Carriacou and Petite Martinique"],
        CARRIACOU
      )
    ).toBe(true);
    expect(alertCoversLocation(["Grenada"], CARRIACOU)).toBe(false);

    const result = alertsForLocation(alerts, CARRIACOU);
    expect(result.status === "ok" && result.activeCount).toBe(2);
  });

  it("leaves the default place and outages unchanged", () => {
    expect(alertsForLocation(alerts, GRENADA)).toBe(alerts);
    const down: AlertsResult = { status: "unavailable" };
    expect(alertsForLocation(down, CARRIACOU)).toBe(down);
  });
});

describe("Carriacou hero", () => {
  const carriacou = weatherForLocation(REFERENCE_WEATHER, CARRIACOU);

  it("names the national forecast and never a station", () => {
    render(
      <SkyHero
        location={CARRIACOU}
        now={new Date("2026-09-08T12:00:00Z")}
        switcher={<LocationSwitcher current={CARRIACOU} />}
        weather={carriacou}
      />
    );
    expect(
      screen.getByRole("heading", { level: 1, hidden: true })
    ).toHaveTextContent("Carriacou & Petite Martinique weather");
    expect(screen.getByText("No observing station here")).toBeInTheDocument();
    expect(screen.queryByText(STATION_NAME)).not.toBeInTheDocument();
    expect(screen.queryByText(MBIA_NAME)).not.toBeInTheDocument();
    // One label per day panel: the forecast is national, and says so.
    expect(screen.getAllByText(NATIONAL_LABEL).length).toBeGreaterThan(0);
  });

  it("keeps the Grenada hero on its station", () => {
    render(
      <SkyHero
        location={GRENADA}
        now={new Date("2026-09-08T12:00:00Z")}
        weather={REFERENCE_WEATHER}
      />
    );
    expect(screen.getByText(GRENADA_STATION_LINE)).toBeInTheDocument();
  });
});

describe("weather for a place", () => {
  it("never shows another station's reading", () => {
    expect(weatherForLocation(REFERENCE_WEATHER, GRENADA)).toBe(
      REFERENCE_WEATHER
    );
    const carriacou = weatherForLocation(REFERENCE_WEATHER, CARRIACOU);
    expect(carriacou.observation).toBeNull();
    expect(carriacou.label.startsWith("National forecast")).toBe(true);
  });
});
