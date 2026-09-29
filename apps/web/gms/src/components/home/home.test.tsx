import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Discover,
  ExploreToday,
  GrenadaInData,
  TodayAtAGlance,
  WeatherNow,
} from "@/components/home/sample-sections";
import { SkyHero } from "@/components/home/sky-hero";
import { WarningTakeover } from "@/components/home/warning-takeover";
import type { AlertsResult, PublicAlert } from "@/lib/cap";
import { REFERENCE_WEATHER } from "@/lib/forecast-data";
import { unavailableWeather } from "@/lib/forecast-selection";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const SAMPLE_NOTE = /Sample content — not an operational product/;
const ALL_CLEAR = /no active alerts/i;
const HERO_NAME = /^Grenada weather/;

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
    render(<SkyHero weather={REFERENCE_WEATHER} />);
    const hero = screen.getByRole("region", { name: HERO_NAME });
    expect(within(hero).getByText("32°", { exact: false })).toBeInTheDocument();
    expect(
      within(hero).getByText(REFERENCE_WEATHER.days[0].summary)
    ).toBeInTheDocument();
    expect(
      within(hero).getByRole("link", { name: "7-day forecast" })
    ).toHaveAttribute("href", "/weather/7-day");
  });

  it("says so when there is no observation or forecast", () => {
    render(<SkyHero weather={unavailableWeather()} />);
    expect(screen.getByText("No current observation")).toBeInTheDocument();
    expect(screen.getByText("No current temperature")).toBeInTheDocument();
    expect(screen.getByText("Forecast unavailable")).toBeInTheDocument();
  });
});

describe("sample sections", () => {
  it.each([
    ["Explore today", <ExploreToday key="b" />],
    ["Grenada in data", <GrenadaInData key="c" />],
    ["Discover", <Discover key="d" />],
  ])("%s is marked as sample content", (_name, section) => {
    render(section);
    expect(screen.getByRole("note")).toHaveTextContent(SAMPLE_NOTE);
    expect(screen.queryByText(ALL_CLEAR)).not.toBeInTheDocument();
  });

  it("shows Today at a glance without a sample notice", () => {
    render(<TodayAtAGlance />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows the issued summary as the forecaster note", () => {
    render(<WeatherNow forecasterNote="Passing showers tonight." />);
    expect(screen.getByText("Passing showers tonight.")).toBeInTheDocument();
  });
});
