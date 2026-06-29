import { createStore } from "zustand/vanilla";

import type {
  ContentLayout,
  NavbarStyle,
  SidebarCollapsible,
  SidebarVariant,
} from "./layout";
import { PREFERENCE_DEFAULTS } from "./preferences-config";
import type { ResolvedThemeMode, ThemeMode, ThemePreset } from "./theme";

export interface PreferencesState {
  contentLayout: ContentLayout;
  isSynced: boolean;
  navbarStyle: NavbarStyle;
  resolvedThemeMode: ResolvedThemeMode;
  setContentLayout: (layout: ContentLayout) => void;
  setIsSynced: (val: boolean) => void;
  setNavbarStyle: (style: NavbarStyle) => void;
  setResolvedThemeMode: (mode: ResolvedThemeMode) => void;
  setSidebarCollapsible: (mode: SidebarCollapsible) => void;
  setSidebarVariant: (variant: SidebarVariant) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePreset: (preset: ThemePreset) => void;
  sidebarCollapsible: SidebarCollapsible;
  sidebarVariant: SidebarVariant;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
}

export const createPreferencesStore = (init?: Partial<PreferencesState>) =>
  createStore<PreferencesState>()((set) => ({
    themeMode: init?.themeMode ?? PREFERENCE_DEFAULTS.theme_mode,
    resolvedThemeMode: init?.resolvedThemeMode ?? "light",
    themePreset: init?.themePreset ?? PREFERENCE_DEFAULTS.theme_preset,
    contentLayout: init?.contentLayout ?? PREFERENCE_DEFAULTS.content_layout,
    navbarStyle: init?.navbarStyle ?? PREFERENCE_DEFAULTS.navbar_style,
    sidebarVariant: init?.sidebarVariant ?? PREFERENCE_DEFAULTS.sidebar_variant,
    sidebarCollapsible:
      init?.sidebarCollapsible ?? PREFERENCE_DEFAULTS.sidebar_collapsible,
    setThemeMode: (mode) => set({ themeMode: mode }),
    setResolvedThemeMode: (mode) => set({ resolvedThemeMode: mode }),
    setThemePreset: (preset) => set({ themePreset: preset }),
    setContentLayout: (layout) => set({ contentLayout: layout }),
    setNavbarStyle: (style) => set({ navbarStyle: style }),
    setSidebarVariant: (variant) => set({ sidebarVariant: variant }),
    setSidebarCollapsible: (mode) => set({ sidebarCollapsible: mode }),
    isSynced: init?.isSynced ?? false,
    setIsSynced: (val) => set({ isSynced: val }),
  }));
