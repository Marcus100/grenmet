import { vi } from "vitest";

export const navigationState = { pathname: "/" };
export const push = vi.fn();
export const setThemeMode = vi.fn();

export function mockPreferences(synced = false) {
  return {
    usePreferencesStore: (
      selector: (state: Record<string, unknown>) => unknown
    ) =>
      selector({
        isSynced: synced,
        sidebarCollapsible: "icon",
        sidebarVariant: "inset",
        themeMode: "light",
        resolvedThemeMode: "light",
        themePreset: "default",
        font: "inter",
        contentLayout: "centered",
        navbarStyle: "sticky",
        setThemeMode,
        setThemePreset: vi.fn(),
        setFont: vi.fn(),
        setContentLayout: vi.fn(),
        setNavbarStyle: vi.fn(),
        setSidebarVariant: vi.fn(),
        setSidebarCollapsible: vi.fn(),
      }),
  };
}
