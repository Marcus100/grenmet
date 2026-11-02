import { PreferencesStoreProvider } from "@barrelsgd/theme/components/preferences-provider";
import {
  deleteClientCookie,
  getClientCookie,
} from "@barrelsgd/theme/lib/cookie.client";
import { PREFERENCE_DEFAULTS } from "@barrelsgd/theme/lib/preferences-config";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

const TOGGLE_NAME = /^Current theme/;
const LIGHT_NOW = "Current theme: light. Click to switch to dark";
const DARK_NOW = "Current theme: dark. Click to switch to light";

function renderToggle(
  mode: "light" | "dark" | "system" = "light",
  htmlMode: string = mode
) {
  // What the boot script leaves on <html> before hydration.
  document.documentElement.setAttribute("data-theme-mode", htmlMode);
  return render(
    <PreferencesStoreProvider
      contentLayout={PREFERENCE_DEFAULTS.content_layout}
      font={PREFERENCE_DEFAULTS.font}
      navbarStyle={PREFERENCE_DEFAULTS.navbar_style}
      themeMode={mode}
      themePreset={PREFERENCE_DEFAULTS.theme_preset}
    >
      <ThemeToggle tone="drawer" />
    </PreferencesStoreProvider>
  );
}

const toggle = () => screen.getByRole("button", { name: TOGGLE_NAME });

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme-mode");
  deleteClientCookie("theme_mode");
});

describe("ThemeToggle", () => {
  it("is one button and opens in light, offering dark", () => {
    renderToggle("light");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(toggle()).toHaveAccessibleName(LIGHT_NOW);
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("switches between light and dark only, and remembers the choice", async () => {
    renderToggle("light");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName(DARK_NOW);
    expect(document.documentElement).toHaveClass("dark");
    expect(getClientCookie("theme_mode")).toBe("dark");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName(LIGHT_NOW);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(getClientCookie("theme_mode")).toBe("light");
  });

  it("moves a visitor who stored the old system choice to light", () => {
    renderToggle("system", "system");
    expect(toggle()).toHaveAccessibleName(LIGHT_NOW);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(getClientCookie("theme_mode")).toBe("light");
  });
});
