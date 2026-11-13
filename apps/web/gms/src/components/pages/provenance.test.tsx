import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Provenance } from "@/components/pages/provenance";
import { localDateTime, parseGrenadaTime } from "@/lib/current-conditions";
import {
  forecastValidity,
  isForecastIssueStale,
  isSatelliteStale,
  isStale,
  OBSERVATION_STALE_AFTER_MS,
} from "@/lib/freshness";

const NOW = new Date("2026-10-18T16:00:00Z");
const OBSERVED_LABEL = /Last observed:/u;
const STATUS_LABEL = /Status:/u;
const OLD_READING = /older than usual/u;
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

describe("freshness limits", () => {
  it("observations go stale after two hours", () => {
    expect(OBSERVATION_STALE_AFTER_MS).toBe(2 * 60 * 60 * 1000);
    expect(isStale(minutesAgo(119), NOW)).toBe(false);
    expect(isStale(minutesAgo(121), NOW)).toBe(true);
  });
  it("a forecast is judged by its valid-to time", () => {
    expect(forecastValidity("2026-10-18T17:00", NOW)).toBe("in-effect");
    expect(forecastValidity("2026-10-18T12:00", NOW)).toBe("expired");
  });
  it("without a valid-to, a forecast issued more than 12 hours ago is flagged", () => {
    expect(isForecastIssueStale(minutesAgo(11 * 60), NOW)).toBe(false);
    expect(isForecastIssueStale(minutesAgo(12 * 60 + 1), NOW)).toBe(true);
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

  it("warns in words, with the age, when an observation is stale", () => {
    render(
      <Provenance
        kind="observation"
        now={NOW}
        source="GMS register"
        status="verified"
        time={minutesAgo(150)}
      />
    );
    expect(
      screen.getByText((content) => content.includes("Last observed:"))
    ).toBeTruthy();
    const warning = screen.getByRole("status").textContent ?? "";
    expect(warning).toContain("Warning:");
    expect(warning).toContain("Observed 2 hours ago");
    expect(warning).toContain("older than usual");
  });

  it("flags an old forecast with no valid-to, and a stale satellite image", () => {
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

  it("says a forecast has expired at its valid-to time and names the next issue", () => {
    render(
      <Provenance
        kind="forecast"
        now={new Date("2026-10-18T09:00:00Z")}
        source="GMS forecast"
        status="verified"
        time="2026-10-17T18:00"
        validTo="2026-10-18T05:00"
      />
    );
    const notice = screen.getByRole("status").textContent ?? "";
    expect(notice).toContain("This forecast expired at 5:00 a.m. AST");
    expect(notice).toContain("the next issue is due 7:00 a.m.");
  });

  it("does not flag a forecast that is still within its valid-to time", () => {
    render(
      <Provenance
        kind="forecast"
        now={NOW}
        source="GMS forecast"
        status="verified"
        time={minutesAgo(30)}
        validTo="2026-10-18T18:00"
      />
    );
    expect(screen.queryByRole("status")).toBeNull();
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
