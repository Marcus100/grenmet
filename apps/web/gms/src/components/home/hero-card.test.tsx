import type { PublicObservation } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayCard, NowCard } from "@/components/home/hero-card";
import { currentConditions } from "@/lib/current-conditions";
import type { ForecastDayData } from "@/lib/forecast-data";

// 18:00Z is 14:00 AST on 10 Nov 2026 (Grenada is UTC-4 all year).
const NOW = new Date("2026-11-10T18:00:00Z");

function observation(observedAt: string): PublicObservation {
  return {
    station_id: "78958",
    observed_at: observedAt,
    status: "accepted",
    temperature_c: 29,
    wind_calm: false,
    wind_direction: "ESE",
    wind_speed_kt: 12,
    weather: "Partly cloudy",
  } as PublicObservation;
}

const issuedDay = (
  overrides: Partial<ForecastDayData> = {}
): ForecastDayData => ({
  date: "2026-11-10",
  condition: "partly-cloudy",
  conditions: [{ label: "Max Temp", value: "31°C" }],
  high: 31,
  low: 24,
  source: "",
  summary: "Partly cloudy, with a few showers.",
  title: "Forecast",
  ...overrides,
});

const LAST_OBSERVED = /Last observed/u;

describe("<NowCard> on the homepage weather box", () => {
  it("labels a reading within two hours as Now", () => {
    render(
      <NowCard
        current={currentConditions(observation("2026-11-10T13:00"))}
        fallbackTemperature={null}
        now={NOW}
        station="MBIA"
      />
    );
    expect(screen.getByText("Now · MBIA")).toBeInTheDocument();
    expect(screen.queryByText(LAST_OBSERVED)).toBeNull();
  });

  it("says a reading older than two hours was last observed, with its time", () => {
    render(
      <NowCard
        current={currentConditions(observation("2026-11-10T11:00"))}
        fallbackTemperature={null}
        now={NOW}
        station="MBIA"
      />
    );
    expect(
      screen.getByText("Last observed 11:00 a.m. · MBIA")
    ).toBeInTheDocument();
    expect(screen.queryByText("Now · MBIA")).toBeNull();
  });

  it("keeps a reading exactly two hours old as Now", () => {
    render(
      <NowCard
        current={currentConditions(observation("2026-11-10T12:00"))}
        fallbackTemperature={null}
        now={NOW}
        station="MBIA"
      />
    );
    expect(screen.getByText("Now · MBIA")).toBeInTheDocument();
  });
});

describe("<DayCard> forecast card", () => {
  it("shows the forecast with no label while it is in effect", () => {
    render(
      <DayCard
        condition="partly-cloudy"
        day={issuedDay({ validTo: "2026-11-10T18:00" })}
        now={NOW}
      />
    );
    expect(
      screen.getByText("Partly cloudy, with a few showers.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the forecast words and says it expired at its valid-to time", () => {
    render(
      <DayCard
        condition="partly-cloudy"
        day={issuedDay({ validTo: "2026-11-10T05:00" })}
        now={new Date("2026-11-10T09:00:00Z")}
      />
    );
    expect(
      screen.getByText("Partly cloudy, with a few showers.")
    ).toBeInTheDocument();
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Warning:");
    expect(notice.textContent).toContain(
      "This forecast expired at 5:00 a.m. AST; the next issue is due 7:00 a.m."
    );
  });

  it("says validity is not supplied when the forecast has no valid-to", () => {
    render(<DayCard condition="cloudy" day={issuedDay()} now={NOW} />);
    expect(screen.getByRole("status").textContent).toContain(
      "Validity time not supplied"
    );
  });
});
