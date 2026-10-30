import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Provenance } from "@/components/pages/provenance";
import {
  isForecastStale,
  isSatelliteStale,
  isStale,
  localDateTime,
  parseGrenadaTime,
} from "@/lib/current-conditions";

const NOW = new Date("2026-10-18T16:00:00Z");
const OBSERVED_LABEL = /Last observed:/;
const STATUS_LABEL = /Status:/;
const OLD_READING = /more than 90 minutes old/;
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

describe("freshness limits", () => {
  it("observations go stale after 90 minutes", () => {
    expect(isStale(minutesAgo(89), NOW)).toBe(false);
    expect(isStale(minutesAgo(91), NOW)).toBe(true);
  });
  it("forecasts go stale after 12 hours", () => {
    expect(isForecastStale(minutesAgo(11 * 60), NOW)).toBe(false);
    expect(isForecastStale(minutesAgo(12 * 60 + 1), NOW)).toBe(true);
  });
  it("satellite images go stale after 30 minutes", () => {
    expect(isSatelliteStale(minutesAgo(29), NOW)).toBe(false);
    expect(isSatelliteStale(minutesAgo(31), NOW)).toBe(true);
  });
  it("an unreadable time is never fresh", () => {
    expect(isStale("not a time", NOW)).toBe(true);
  });
  it("reads offset-less GMS times as Grenada time (UTC-4)", () => {
    expect(parseGrenadaTime("2026-10-18T06:00")).toBe(
      new Date("2026-10-18T10:00:00Z").getTime()
    );
    expect(localDateTime("2026-10-18T06:00")).toBe("18 Oct, 06:00 AST");
  });
});

describe("<Provenance>", () => {
  it("shows source, Grenada time and status without a warning when fresh", () => {
    render(
      <Provenance
        kind="observation"
        now={NOW}
        source="GMS register"
        status="provisional"
        time={minutesAgo(10)}
      />
    );
    expect(
      screen.getByText((content) => content.includes("GMS register"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("Observed:"))
    ).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("Provisional, not yet quality checked")
      )
    ).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("warns in words when an observation is stale", () => {
    render(
      <Provenance
        kind="observation"
        now={NOW}
        source="GMS register"
        status="verified"
        time={minutesAgo(120)}
      />
    );
    expect(
      screen.getByText((content) => content.includes("Last observed:"))
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("90 minutes");
  });

  it("flags an old forecast and a stale satellite image", () => {
    const { rerender } = render(
      <Provenance
        kind="forecast"
        now={NOW}
        source="GMS forecast"
        status="verified"
        time="2026-10-17T18:00"
      />
    );
    expect(screen.getByRole("status").textContent).toContain("12 hours");
    rerender(
      <Provenance
        kind="satellite"
        now={NOW}
        source="NOAA"
        status="external"
        time={minutesAgo(45)}
      />
    );
    expect(screen.getByRole("status").textContent).toContain("30 minutes");
  });

  it("says an external source is not a GMS product", () => {
    render(
      <Provenance
        kind="satellite"
        now={NOW}
        source="NOAA/NESDIS GOES-19"
        status="external"
        time={minutesAgo(5)}
      />
    );
    expect(
      screen.getByText((content) => content.includes("Not a GMS product"))
    ).toBeTruthy();
  });
});

describe("Provenance time", () => {
  it("omits the time when the block above already states it", () => {
    render(
      <Provenance
        kind="observation"
        now={NOW}
        showTime={false}
        source="GMS observation register, MBIA"
        status="verified"
        time={minutesAgo(180)}
      />
    );
    expect(screen.queryByText(OBSERVED_LABEL)).not.toBeInTheDocument();
    expect(screen.getByText(STATUS_LABEL)).toBeInTheDocument();
    expect(screen.getByText(OLD_READING)).toBeInTheDocument();
  });
});
