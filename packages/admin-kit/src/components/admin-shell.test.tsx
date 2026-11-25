import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAVIGATION, USER } from "../test/fixtures";
import { mockPreferences, navigationState, push } from "../test/mocks";
import { AdminShellFrame } from "./admin-shell-frame";

const RE_0 = /Search/u;
const RE_1 = /Current theme/u;
const RE_2 = /Agenda/u;
const RE_3 = /Account menu/u;

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push }),
}));
vi.mock("@barrelsgd/theme/components/preferences-provider", () =>
  mockPreferences()
);
vi.mock("@barrelsgd/theme/lib/preferences-storage", () => ({
  persistPreference: vi.fn(() => Promise.resolve()),
}));
const cookieValues: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (key: string) =>
        key in cookieValues ? { value: cookieValues[key] } : undefined,
    }),
}));
vi.mock("@barrelsgd/theme/lib/server-actions", () => ({
  getPreference: (
    _key: string,
    _allowed: readonly string[],
    fallback: string
  ) => Promise.resolve(fallback),
}));

const BRAND = {
  href: "/",
  logo: <span data-testid="logo">logo</span>,
  name: "Studio",
};

function renderShell(
  extra: Partial<Parameters<typeof AdminShellFrame>[0]> = {}
) {
  return render(
    <AdminShellFrame
      brand={BRAND}
      collapsible="icon"
      defaultOpen
      navigation={NAVIGATION}
      user={{ user: USER, signOut: { action: "/auth/logout" } }}
      variant="inset"
      {...extra}
    >
      <h1>Page body</h1>
    </AdminShellFrame>
  );
}

beforeEach(() => {
  navigationState.pathname = "/agenda";
  push.mockClear();
  window.innerWidth = 1024;
});

describe("AdminShellFrame", () => {
  it("makes the skip link the first focusable element, aimed at the content", async () => {
    renderShell();
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main-content");
    const main = document.getElementById("main-content");
    expect(main).toHaveTextContent("Page body");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("renders the brand, the user and the slots", () => {
    renderShell({
      breadcrumb: <span>Crumb</span>,
      notifications: <button type="button">Bell</button>,
    });
    expect(screen.getByRole("link", { name: "Studio home" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByTestId("logo")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Crumb")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bell" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RE_0 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RE_1 })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Layout preferences" })
    ).toBeInTheDocument();
  });

  it("turns search, the theme switcher and layout controls off", () => {
    renderShell({ layoutControls: false, search: false, themeSwitcher: false });
    expect(screen.queryByRole("button", { name: RE_0 })).toBeNull();
    expect(screen.queryByRole("button", { name: RE_1 })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Layout preferences" })
    ).toBeNull();
  });

  it("marks the current page with aria-current in the sidebar", () => {
    renderShell({ tabBar: false });
    const link = screen.getByRole("link", { name: RE_2 });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("shows badges, with a written label for counts", () => {
    renderShell({ tabBar: false });
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByText("3 waiting to be confirmed")).toHaveClass(
      "sr-only"
    );
  });

  it("opens the parent of the current sub-item and marks it", () => {
    navigationState.pathname = "/settings/billing";
    renderShell({ tabBar: false });
    const billing = screen.getByRole("link", { name: "Billing" });
    expect(billing).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "General" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("shows the phone tab bar for flagged items only, and not when switched off", () => {
    const { unmount } = renderShell();
    expect(
      screen.getByRole("navigation", { name: "Main" })
    ).toBeInTheDocument();
    unmount();
    renderShell({ tabBar: false });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("has no tab bar when no item is flagged", () => {
    renderShell({
      navigation: [{ id: "g", items: [{ id: "a", title: "A", url: "/a" }] }],
    });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("offers a sign-out that posts to the app's URL", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: RE_3 }));
    const item = await screen.findByRole("menuitem", { name: "Sign out" });
    expect(item.closest("form")).toHaveAttribute("action", "/auth/logout");
  });
});

describe("AdminShell (server part)", () => {
  it("reads the saved sidebar state and renders the frame", async () => {
    const { AdminShell } = await import("./admin-shell");
    cookieValues.sidebar_state = "false";
    const element = await AdminShell({
      brand: BRAND,
      children: <p>Inside</p>,
      navigation: NAVIGATION,
      user: { user: USER, signOut: { action: "/auth/logout" } },
    });
    expect(element.props.defaultOpen).toBe(false);
    expect(element.props.variant).toBe("inset");
    expect(element.props.collapsible).toBe("icon");
    render(element);
    expect(within(document.body).getByText("Inside")).toBeInTheDocument();
    cookieValues.sidebar_state = "";
  });
});
