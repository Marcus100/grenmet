import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashShell } from "./dash-shell";

describe("DashShell", () => {
  it("points Build event at the create route, not a demo event id", () => {
    render(
      <DashShell
        active="overview"
        eventName="Feel Free Promotions"
        isDemo={false}
      >
        <p>content</p>
      </DashShell>
    );

    const links = screen.getAllByRole("link", { name: "Build event" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dash/events/new");
    }
  });
});
