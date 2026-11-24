import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/studio/sea-salt/agenda",
}));

import { StudioPlainFrame, StudioShell } from "./studio-shell";

const AGENDA_LINK = /^Agenda/u;

function shell(overrides: Partial<Parameters<typeof StudioShell>[0]> = {}) {
  return (
    <StudioShell
      canCreate
      canPlan
      name="Sea Salt Spa"
      orgSlug="sea-salt"
      pendingCount={0}
      publicHref="/sea-salt-spa"
      userName="Maya"
      {...overrides}
    >
      <h1>Agenda</h1>
    </StudioShell>
  );
}

describe("studio shell", () => {
  it("puts the business, its page link and the page in landmarks", () => {
    render(shell());
    const side = screen.getByRole("complementary");
    expect(within(side).getByText("Sea Salt Spa")).toBeInTheDocument();
    expect(
      within(side).getByRole("link", { name: "/sea-salt-spa" })
    ).toHaveAttribute("href", "/sea-salt-spa");
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Agenda"
    );
  });

  it("ends the laptop navigation with View my page and Sign out", () => {
    render(shell());
    const side = screen.getByRole("complementary");
    expect(
      within(side).getByRole("link", { name: "View my page" })
    ).toHaveAttribute("href", "/sea-salt-spa");
    const out = within(side).getByRole("button", { name: "Sign out" });
    expect(out.closest("form")).toHaveAttribute("action", "/auth/logout");
    expect(out.closest("form")).toHaveAttribute("method", "post");
  });

  it("gives phones a top bar with the business and New booking", () => {
    render(shell());
    const bar = screen.getByRole("banner");
    expect(within(bar).getByText("Sea Salt Spa")).toBeInTheDocument();
    expect(
      within(bar).getByRole("link", { name: "New booking" })
    ).toHaveAttribute("href", "/studio/sea-salt/bookings/new");
  });

  it("leaves New booking, Plan and the page link out when not allowed or not set", () => {
    render(shell({ canCreate: false, canPlan: false, publicHref: null }));
    expect(screen.queryByRole("link", { name: "New booking" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plan & billing" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View my page" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });

  it("links every studio route from the laptop navigation", () => {
    render(shell({ pendingCount: 4 }));
    const nav = screen.getByRole("navigation", { name: "Studio" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/studio/sea-salt/agenda",
      "/studio/sea-salt/bookings/new",
      "/studio/sea-salt/services",
      "/studio/sea-salt/people",
      "/studio/sea-salt/plan",
      "/studio/sea-salt/settings",
    ]);
    expect(
      within(nav).getByRole("link", { name: AGENDA_LINK })
    ).toHaveTextContent("4");
  });
});

describe("studio plain frame", () => {
  it("shows the name and Sign out for a signed-in person", () => {
    render(
      <StudioPlainFrame userName="Maya">
        <p>Page</p>
      </StudioPlainFrame>
    );
    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" })
    ).toBeInTheDocument();
    expect(screen.getByText("Page")).toBeInTheDocument();
  });

  it("leaves the header out without a name", () => {
    render(
      <StudioPlainFrame>
        <p>Page</p>
      </StudioPlainFrame>
    );
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
