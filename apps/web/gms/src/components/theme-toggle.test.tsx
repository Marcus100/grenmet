import { PreferencesStoreProvider } from "@barrelsgd/theme/components/preferences-provider";
import { ThemeBootScript } from "@barrelsgd/theme/components/theme-boot";
import {
  deleteClientCookie,
  getClientCookie,
} from "@barrelsgd/theme/lib/cookie.client";
import { PREFERENCE_DEFAULTS } from "@barrelsgd/theme/lib/preferences-config";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

const SYSTEM_DEFAULT = /"theme_mode":"system"/;
const THEME = /Current theme/;

function renderToggle() {
  // What the boot script leaves on <html> before hydration.
  document.documentElement.setAttribute("data-theme-mode", "system");
  return render(
    <PreferencesStoreProvider
      contentLayout={PREFERENCE_DEFAULTS.content_layout}
      font={PREFERENCE_DEFAULTS.font}
      navbarStyle={PREFERENCE_DEFAULTS.navbar_style}
      themeMode="system"
      themePreset={PREFERENCE_DEFAULTS.theme_preset}
    >
      <ThemeToggle tone="drawer" />
    </PreferencesStoreProvider>
  );
}

afterEach(() => {
  document.documentElement.className = "";
  deleteClientCookie("theme_mode");
});

describe("ThemeToggle", () => {
  it("is one button that cycles auto → light → dark", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    renderToggle();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const toggle = () => screen.getByRole("button", { name: THEME });
    expect(toggle()).toHaveAccessibleName(
      "Current theme: auto. Click to cycle themes"
    );

    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName(
      "Current theme: light. Click to cycle themes"
    );
    expect(document.documentElement).not.toHaveClass("dark");

    await userEvent.click(toggle());
    expect(document.documentElement).toHaveClass("dark");
    expect(getClientCookie("theme_mode")).toBe("dark");
  });
});

describe("ThemeBootScript", () => {
  it("lets the public site default to the device theme", () => {
    expect(
      renderToStaticMarkup(
        <ThemeBootScript defaults={{ theme_mode: "system" }} />
      )
    ).toMatch(SYSTEM_DEFAULT);
  });

  it("keeps the shared light default when an app passes nothing", () => {
    expect(renderToStaticMarkup(<ThemeBootScript />)).toContain(
      '"theme_mode":"light"'
    );
  });
});
