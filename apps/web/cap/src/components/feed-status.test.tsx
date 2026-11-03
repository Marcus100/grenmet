import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertCard } from "@/components/alert-card";
import { FeedStatus } from "@/components/feed-status";
import type { AlertView } from "@/lib/alerts";

const CLOCK_0959 = /09:59/u;
const TAKE_ACTION = /Take action now/u;
const NOT_LIVE = /not a live warning/u;
const NOW = new Date("2026-10-18T14:00:00Z");

describe("FeedStatus", () => {
  it("says the service is unreachable, never an all-clear", () => {
    render(<FeedStatus now={NOW} result={{ status: "unavailable" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Alert service temporarily unreachable"
    );
    expect(screen.getByRole("alert")).toHaveTextContent("not an all-clear");
  });

  it("flags last-known-good data with its time", () => {
    render(
      <FeedStatus
        now={NOW}
        result={{
          data: [],
          fetchedAt: new Date("2026-10-18T13:50:00Z"),
          status: "stale",
        }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("09:50");
  });

  it("shows the last-updated time when fresh", () => {
    render(
      <FeedStatus
        now={NOW}
        result={{
          data: [],
          fetchedAt: new Date("2026-10-18T13:59:00Z"),
          status: "ok",
        }}
      />
    );
    expect(screen.getAllByText(CLOCK_0959).length).toBeGreaterThan(0);
  });
});

describe("AlertCard", () => {
  const view: AlertView = {
    areas: ["Grenada"],
    certainty: "Likely",
    description: "Heavy rain expected",
    effective: null,
    event: "Heavy rain",
    expires: null,
    headline: "Heavy rain warning",
    identifier: "id-1",
    instruction: null,
    level: "take-action",
    msgType: "Alert",
    onset: null,
    sent: "2026-10-18T12:00:00Z",
    severity: "Severe",
    status: "Actual",
    urgency: "Immediate",
  };

  it("states severity, urgency and certainty in words", () => {
    render(<AlertCard view={view} />);
    expect(screen.getByText("Severe")).toBeInTheDocument();
    expect(screen.getByText("Immediate")).toBeInTheDocument();
    expect(screen.getByText("Likely")).toBeInTheDocument();
    expect(screen.getByText(TAKE_ACTION)).toBeInTheDocument();
  });

  it("labels exercise messages as not live", () => {
    render(<AlertCard view={{ ...view, status: "Exercise" }} />);
    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument();
  });
});
