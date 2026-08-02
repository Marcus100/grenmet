import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventOverview } from "./event-overview";

describe("EventOverview", () => {
  it("presents the event operating state and primary financial record", () => {
    render(<EventOverview />);

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
    render(<EventOverview />);

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
    render(<EventOverview />);

    expect(screen.getByText("Connect payout account")).toBeInTheDocument();
    expect(screen.getByText("Confirm agent inventory")).toBeInTheDocument();
    expect(screen.getByText("Download the door plan")).toBeInTheDocument();
    expect(screen.getByText("2 open exceptions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage event" })).toBeDisabled();
  });
});
