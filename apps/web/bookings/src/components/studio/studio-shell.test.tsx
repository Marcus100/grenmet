import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adminShellMock, preferencesMock } from "@/test/admin-shell";

const navigationState = vi.hoisted(() => ({
  pathname: "/studio/sea-salt/agenda",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@barrelsgd/admin-kit/components/admin-shell", () => adminShellMock());
vi.mock("@barrelsgd/theme/components/preferences-provider", () =>
  preferencesMock()
);
vi.mock("@barrelsgd/theme/lib/preferences-storage", () => ({
  persistPreference: vi.fn(() => Promise.resolve()),
}));

import { StudioPlainFrame, StudioShell } from "./studio-shell";

const AGENDA_LINK = /^Agenda/u;
const ACCOUNT_MENU = /Account menu/u;
const SEARCH = /Search/u;
const THEME = /Current theme/u;

function shell(overrides: Partial<Parameters<typeof StudioShell>[0]> = {}) {
  return (
    <StudioShell
      canManage
      name="Sea Salt Spa"
      orgSlug="sea-salt"
      pendingCount={0}
      publicHref="/sea-salt-spa"
      user={{ email: "maya@example.com", name: "Maya" }}
      {...overrides}
    >
      <h1>Agenda</h1>
    </StudioShell>
  );
}

describe("studio shell", () => {
  it("names the business in the brand and puts the page in main", () => {
    render(shell());
    expect(
      screen.getByRole("link", { name: "Sea Salt Spa home" })
    ).toHaveAttribute("href", "/studio/sea-salt/agenda");
    expect(screen.getByText("Sea Salt Spa")).toBeInTheDocument();
    const main = document.getElementById("main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(
      within(main as HTMLElement).getByRole("heading", { level: 1 })
    ).toHaveTextContent("Agenda");
  });

  it("links every studio route from the sidebar for an owner or admin", () => {
    render(shell({ pendingCount: 4 }));
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    for (const href of [
      "/studio/sea-salt/agenda",
      "/studio/sea-salt/bookings/new",
      "/studio/sea-salt/services",
      "/studio/sea-salt/people",
      "/studio/sea-salt/settings",
      "/studio/sea-salt/plan",
      "/sea-salt-spa",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("opens View my page for customers in a new tab", () => {
    render(shell());
    const link = screen.getByRole("link", { name: "View my page" });
    expect(link).toHaveAttribute("href", "/sea-salt-spa");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("puts New booking in the top bar for owners and admins only", () => {
    const { unmount } = render(shell());
    const bar = screen.getByRole("banner");
    expect(
      within(bar).getByRole("link", { name: "New booking" })
    ).toHaveAttribute("href", "/studio/sea-salt/bookings/new");
    unmount();
    render(shell({ canManage: false }));
    expect(screen.queryByRole("link", { name: "New booking" })).toBeNull();
  });

  it("leaves New booking, Plan and the page link out for a member without a page", () => {
    render(shell({ canManage: false, publicHref: null }));
    expect(screen.queryByRole("link", { name: "New booking" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plan & billing" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View my page" })).toBeNull();
  });

  it("marks the current page and says how many bookings are waiting", () => {
    render(shell({ pendingCount: 4 }));
    const agenda = screen.getAllByRole("link", { name: AGENDA_LINK });
    expect(agenda[0]).toHaveAttribute("aria-current", "page");
    const row = agenda[0]?.closest("li") as HTMLElement;
    expect(row).toHaveTextContent("4");
    expect(within(row).getByText("4 waiting to be confirmed")).toHaveClass(
      "sr-only"
    );
  });

  it("gives phones a tab bar of Agenda, Services, People and More", () => {
    render(shell({ pendingCount: 2 }));
    const tabs = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual([
      "/studio/sea-salt/agenda",
      "/studio/sea-salt/services",
      "/studio/sea-salt/people",
    ]);
    expect(
      within(tabs).getByRole("button", { name: "More" })
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole("link", { name: AGENDA_LINK })
    ).toHaveTextContent("2");
  });

  it("opens the sidebar sheet from More", () => {
    render(shell());
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
  });

  it("signs out with a POST to /auth/logout", async () => {
    render(shell());
    fireEvent.click(screen.getByRole("button", { name: ACCOUNT_MENU }));
    const out = await screen.findByRole("menuitem", { name: "Sign out" });
    expect(out.closest("form")).toHaveAttribute("action", "/auth/logout");
    expect(out.closest("form")).toHaveAttribute("method", "post");
  });

  it("is light only: no theme switch and no layout controls", () => {
    render(shell());
    expect(screen.queryByRole("button", { name: THEME })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Layout preferences" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: SEARCH })).toBeInTheDocument();
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
