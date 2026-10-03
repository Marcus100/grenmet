import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationSwitcher } from "@/components/home/location-switcher";
import type { AlertsResult, PublicAlert } from "@/lib/cap";
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

/** The registry as it will be once Carriacou's data is wired. */
const BOTH: SiteLocation[] = LOCATIONS.map((location) => ({
  ...location,
  enabled: true,
}));
const GRENADA = defaultLocation(BOTH);
const CARRIACOU = BOTH.find((l) => l.slug === "carriacou") as SiteLocation;

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

describe("today: Grenada only", () => {
  it("serves no prefixed location routes and hides the switcher", () => {
    expect(enabledLocations().map((l) => l.slug)).toEqual(["grenada"]);
    expect(prefixedLocationParams()).toEqual([]);
    expect(locationBySlug("carriacou")).toBeUndefined();
    const { container } = render(
      <LocationSwitcher current={defaultLocation()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("with a second place enabled", () => {
  it("prefixes every place but the default", () => {
    expect(prefixedLocationParams(BOTH)).toEqual([{ location: "carriacou" }]);
    expect(locationHref(GRENADA, "/weather")).toBe("/weather");
    expect(locationHref(CARRIACOU)).toBe("/carriacou");
    expect(locationHref(CARRIACOU, "/weather")).toBe("/carriacou/weather");
  });

  it("shows a switcher that marks the current place", () => {
    render(<LocationSwitcher current={CARRIACOU} registry={BOTH} />);
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
