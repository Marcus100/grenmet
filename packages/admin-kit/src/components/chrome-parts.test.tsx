import { SidebarProvider } from "@barrelsgd/ui/components/ui/sidebar";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockPreferences, setThemeMode } from "../test/mocks";
import { LayoutControls } from "./layout-controls";
import { NavUser } from "./nav-user";
import { ThemeSwitcher } from "./theme-switcher";

const RE_0 = /Account menu/u;

vi.mock("@barrelsgd/theme/components/preferences-provider", () =>
  mockPreferences()
);
vi.mock("@barrelsgd/theme/lib/preferences-storage", () => ({
  persistPreference: vi.fn(() => Promise.resolve()),
}));

describe("NavUser", () => {
  it("shows the person, links and every sign-out choice", async () => {
    render(
      <SidebarProvider>
        <NavUser
          links={[{ href: "/profile", label: "Profile" }]}
          signOut={[
            { action: "/auth/logout" },
            { action: "/auth/logout-all", label: "Sign out of all apps" },
          ]}
          user={{ email: "ada@example.com", name: "Ada Lovelace" }}
        />
      </SidebarProvider>
    );
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Account menu for Ada Lovelace" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Profile" })
    ).toHaveAttribute("href", "/profile");
    expect(
      screen.getByRole("menuitem", { name: "Sign out" })
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("menuitem", { name: "Sign out of all apps" })
        .closest("form")
    ).toHaveAttribute("action", "/auth/logout-all");
  });

  it("omits the links section when there are none", async () => {
    render(
      <SidebarProvider>
        <NavUser
          signOut={{ action: "/auth/logout" }}
          user={{ email: "a@b.c", name: "Ada" }}
        />
      </SidebarProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: RE_0 }));
    expect(
      await screen.findByRole("menuitem", { name: "Sign out" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Profile" })).toBeNull();
  });
});

describe("ThemeSwitcher", () => {
  it("names the current theme and the action", () => {
    render(<ThemeSwitcher />);
    expect(
      screen.getByRole("button", {
        name: "Current theme: light. Click to cycle themes",
      })
    ).toBeInTheDocument();
  });
});

describe("ThemeSwitcher cycling", () => {
  it("moves from light to dark", async () => {
    render(<ThemeSwitcher />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Current theme: light. Click to cycle themes",
      })
    );
    expect(setThemeMode).toHaveBeenCalledWith("dark");
  });
});

describe("LayoutControls", () => {
  it("opens the preferences without a font choice by default", async () => {
    render(<LayoutControls />);
    await userEvent.click(
      screen.getByRole("button", { name: "Layout preferences" })
    );
    expect(await screen.findByText("Page Layout")).toBeInTheDocument();
    expect(screen.getByText("Sidebar Style")).toBeInTheDocument();
    expect(screen.queryByText("Font")).toBeNull();
  });

  it("shows the font choice when the app ships fonts", async () => {
    render(<LayoutControls fontOptions={[{ key: "inter", label: "Inter" }]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Layout preferences" })
    );
    expect(await screen.findByText("Font")).toBeInTheDocument();
  });
});
