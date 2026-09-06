import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_EVENT_ID, getEventDashboard } from "@/data/events";
import type { EventDashboard } from "@/domain/types";
import { EventOverview } from "./event-overview";

let dashboard: EventDashboard;

beforeAll(async () => {
  const loaded = await getEventDashboard(DEMO_EVENT_ID);

  if (!loaded) {
    throw new Error("Expected the demo event dashboard to load.");
  }

  dashboard = loaded;
});

describe("EventOverview", () => {
  it("reports figures derived from the sales channels rather than fixed copy", () => {
    render(<EventOverview dashboard={dashboard} />);

    // 436 + 62 + 18 orders, 626 + 78 + 38 tickets across the three channels.
    expect(screen.getByText("742")).toBeInTheDocument();
    expect(screen.getByText("516")).toBeInTheDocument();
    expect(screen.getByText("$18,420")).toBeInTheDocument();
    expect(screen.getByText("1.4 tickets per order")).toBeInTheDocument();
    expect(screen.getByText("516 orders · 742 tickets")).toBeInTheDocument();
  });

  it("renders the event date in Grenada local time", () => {
    render(<EventOverview dashboard={dashboard} />);

    expect(
      screen.getByText("Saturday, 15 August · 4:00 PM")
    ).toBeInTheDocument();
  });
});
