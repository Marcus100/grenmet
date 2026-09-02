import { render, screen, within } from "@testing-library/react";
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
  it("presents the event operating state and primary financial record", () => {
    render(<EventOverview dashboard={dashboard} />);

    expect(
      screen.getByRole("heading", { name: "Feel Free: Sunset", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Event readiness" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Settlement preview" })
    ).toBeInTheDocument();
    expect(screen.getByText("$16,884.20")).toBeInTheDocument();
  });

  it("keeps the organiser workflow visible in the primary navigation", () => {
    render(<EventOverview dashboard={dashboard} />);

    const navigation = screen.getByRole("navigation", {
      name: "Event workspace",
    });

    expect(
      within(navigation).getByRole("link", { name: "Overview" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).getByRole("link", { name: "Door & box office" })
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(navigation).getByRole("link", { name: "Finance" })
    ).toHaveAttribute("aria-disabled", "true");

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Mobile event workspace",
    });
    expect(
      within(mobileNavigation).getByRole("link", { name: "Finance" })
    ).toBeInTheDocument();
  });

  it("shows unresolved operational work before the event", () => {
    render(<EventOverview dashboard={dashboard} />);

    expect(screen.getByText("Connect payout account")).toBeInTheDocument();
    expect(screen.getByText("Confirm agent inventory")).toBeInTheDocument();
    expect(screen.getByText("Download the door plan")).toBeInTheDocument();
    expect(screen.getByText("2 open exceptions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage event" })).toBeDisabled();
  });

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
