import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExploreToday, GrenadaInData } from "@/components/home/data-sections";
import { SkyHero } from "@/components/home/sky-hero";
import { WarningTakeover } from "@/components/home/warning-takeover";
import { WeatherNow } from "@/components/home/weather-now";
import type { AlertsResult, PublicAlert } from "@/lib/cap-alerts";
import { REFERENCE_WEATHER } from "@/lib/forecast-data";
import { unavailableWeather } from "@/lib/forecast-selection";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/env", () => ({ env: { CMS_API_URL: "" } }));
vi.mock("@/lib/products", () => ({
  fetchMonthSummary: async () => null,
  fetchSectorOutlook: async () => null,
}));

const HERO_NAME = /^Grenada weather/;
const STATION_NAME = /Maurice Bishop International \(MBIA\)/;

function alert(overrides: Partial<PublicAlert>): PublicAlert {
  return {
    areas: ["Grenada"],
    event: "Hurricane Warning",
    expires: null,
    headline: "Hurricane conditions expected tonight",
    identifier: "urn:gms:1",
    severity: "Extreme",
    status: "Actual",
    ...overrides,
  };
}

const result = (alerts: PublicAlert[]): AlertsResult => ({
  activeCount: alerts.length,
  groups: [{ alerts, name: "Tropical Cyclone" }],
  status: "ok",
});

const NO_OBSERVATION_LABEL = /^No current observation · /;

describe("WarningTakeover", () => {
  it("renders the live take-action alert and links to it", () => {
    render(<WarningTakeover alerts={result([alert({})])} />);
    expect(
      screen.getByRole("heading", { name: "Hurricane Warning" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Hurricane conditions expected tonight")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read the warning" })
    ).toHaveAttribute("href", "/alerts/urn%3Agms%3A1");
  });

  it.each([
    ["a lower level", result([alert({ severity: "Moderate" })])],
    ["an exercise", result([alert({ status: "Exercise" })])],
    ["nothing in effect", result([])],
    ["an outage", { status: "unavailable" } as AlertsResult],
  ])("stays out of the way for %s", (_label, alerts) => {
    const { container } = render(<WarningTakeover alerts={alerts} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SkyHero", () => {
  it("leads with the latest observation and today's issued figures", () => {
    render(<SkyHero selected="today" weather={REFERENCE_WEATHER} />);
    const hero = screen.getByRole("region", { name: HERO_NAME });
    expect(within(hero).getByRole("heading", { level: 1 })).toHaveTextContent(
      "MBIA"
    );
    expect(within(hero).queryByText(STATION_NAME)).not.toBeInTheDocument();
    expect(within(hero).getByText("Your spice weather")).toBeVisible();
    expect(
      within(hero).getAllByText("32°", { exact: false }).length
    ).toBeGreaterThan(0);
    expect(
      within(hero).getByText(REFERENCE_WEATHER.days[0]?.summary ?? "")
    ).toBeInTheDocument();
    expect(
      within(hero).queryByRole("link", { name: "Marine" })
    ).not.toBeInTheDocument();
  });

  it("says so when there is no observation or forecast", () => {
    const visible = (elements: HTMLElement[]) =>
      elements.filter((element) => !element.closest('[aria-hidden="true"]'));
    render(<SkyHero weather={unavailableWeather()} />);
    expect(visible(screen.getAllByText(NO_OBSERVATION_LABEL))).toHaveLength(1);
    expect(
      screen.getAllByText("No current observation").length
    ).toBeGreaterThan(0);
    cleanup();
    render(<SkyHero selected="today" weather={unavailableWeather()} />);
    // Every tab's card is on the page, stacked; only the selected one is shown.
    expect(
      within(screen.getByRole("region", { name: "Weather summary" })).getByText(
        "No forecast yet"
      )
    ).toBeInTheDocument();
  });
});

describe("data sections", () => {
  it.each([
    ["Explore today", ExploreToday],
    ["Grenada in data", GrenadaInData],
  ])(
    "shows %s without a sample or placeholder notice",
    async (_name, Section) => {
      render(await Section());
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    }
  );

  it("offers imagery, audio and video as tabs in the Weather now panel", async () => {
    render(await WeatherNow());
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Satellite",
      "Wind",
      "Seas",
      "Audio",
      "Video",
    ]);
  });
});
