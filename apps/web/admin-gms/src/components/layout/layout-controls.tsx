"use client";

import { usePreferencesStore } from "@grenmet/theme/components/preferences-provider";
import type {
  ContentLayout,
  NavbarStyle,
  SidebarCollapsible,
  SidebarVariant,
} from "@grenmet/theme/lib/layout";
import {
  applyContentLayout,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
} from "@grenmet/theme/lib/layout-utils";
import { PREFERENCE_DEFAULTS } from "@grenmet/theme/lib/preferences-config";
import { persistPreference } from "@grenmet/theme/lib/preferences-storage";
import {
  THEME_PRESET_OPTIONS,
  type ThemeMode,
  type ThemePreset,
} from "@grenmet/theme/lib/theme";
import { applyThemePreset } from "@grenmet/theme/lib/theme-utils";
import { Button } from "@grenmet/ui/components/ui/button";
import { Label } from "@grenmet/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@grenmet/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@grenmet/ui/components/ui/toggle-group";
import { Settings } from "lucide-react";
import { fontOptions } from "@/lib/fonts/registry";

export function LayoutControls() {
  const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const themePreset = usePreferencesStore((s) => s.themePreset);
  const setThemePreset = usePreferencesStore((s) => s.setThemePreset);
  const font = usePreferencesStore((s) => s.font);
  const setFont = usePreferencesStore((s) => s.setFont);
  const contentLayout = usePreferencesStore((s) => s.contentLayout);
  const setContentLayout = usePreferencesStore((s) => s.setContentLayout);
  const navbarStyle = usePreferencesStore((s) => s.navbarStyle);
  const setNavbarStyle = usePreferencesStore((s) => s.setNavbarStyle);
  const variant = usePreferencesStore((s) => s.sidebarVariant);
  const setSidebarVariant = usePreferencesStore((s) => s.setSidebarVariant);
  const collapsible = usePreferencesStore((s) => s.sidebarCollapsible);
  const setSidebarCollapsible = usePreferencesStore(
    (s) => s.setSidebarCollapsible
  );

  const getSingleToggleValue = <T extends string>(groupValue: string[]) =>
    groupValue[0] as T | undefined;

  const onThemePresetChange = (preset: ThemePreset) => {
    applyThemePreset(preset);
    setThemePreset(preset);
    persistPreference("theme_preset", preset).catch(() => undefined);
  };

  const onThemeModeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    persistPreference("theme_mode", mode).catch(() => undefined);
  };

  const onFontChange = (nextFont: string) => {
    document.documentElement.setAttribute("data-font", nextFont);
    setFont(nextFont);
    persistPreference("font", nextFont).catch(() => undefined);
  };

  const onContentLayoutChange = (layout: ContentLayout) => {
    applyContentLayout(layout);
    setContentLayout(layout);
    persistPreference("content_layout", layout).catch(() => undefined);
  };

  const onNavbarStyleChange = (style: NavbarStyle) => {
    applyNavbarStyle(style);
    setNavbarStyle(style);
    persistPreference("navbar_style", style).catch(() => undefined);
  };

  const onSidebarStyleChange = (value: SidebarVariant) => {
    setSidebarVariant(value);
    applySidebarVariant(value);
    persistPreference("sidebar_variant", value).catch(() => undefined);
  };

  const onSidebarCollapseModeChange = (value: SidebarCollapsible) => {
    setSidebarCollapsible(value);
    applySidebarCollapsible(value);
    persistPreference("sidebar_collapsible", value).catch(() => undefined);
  };

  const handleRestore = () => {
    onThemePresetChange(PREFERENCE_DEFAULTS.theme_preset);
    onFontChange(PREFERENCE_DEFAULTS.font);
    onThemeModeChange(PREFERENCE_DEFAULTS.theme_mode);
    onContentLayoutChange(PREFERENCE_DEFAULTS.content_layout);
    onNavbarStyleChange(PREFERENCE_DEFAULTS.navbar_style);
    onSidebarStyleChange(PREFERENCE_DEFAULTS.sidebar_variant);
    onSidebarCollapseModeChange(PREFERENCE_DEFAULTS.sidebar_collapsible);
  };

  return (
    <Popover>
      <PopoverTrigger render={<Button size="icon" />}>
        <Settings />
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="font-medium text-sm leading-none">Preferences</h4>
            <p className="text-muted-foreground text-xs">
              Customize your dashboard layout preferences.
            </p>
          </div>
          <div className="space-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs">
            <div className="space-y-1">
              <Label className="font-medium text-xs">Theme Preset</Label>
              <Select
                items={THEME_PRESET_OPTIONS.map((preset) => ({
                  value: preset.value,
                  label: preset.label,
                }))}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onThemePresetChange(value as ThemePreset);
                }}
                value={themePreset}
              >
                <SelectTrigger className="w-full text-xs" size="sm">
                  <SelectValue className="items-center" placeholder="Preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {THEME_PRESET_OPTIONS.map((preset) => (
                      <SelectItem
                        className="text-xs"
                        key={preset.value}
                        value={preset.value}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{
                              backgroundColor:
                                (resolvedThemeMode ?? "light") === "dark"
                                  ? preset.primary.dark
                                  : preset.primary.light,
                            }}
                          />
                          {preset.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Font</Label>
              <Select
                items={fontOptions.map((f) => ({
                  value: f.key,
                  label: f.label,
                }))}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onFontChange(value);
                }}
                value={font}
              >
                <SelectTrigger className="w-full text-xs" size="sm">
                  <SelectValue className="items-center" placeholder="Font" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {fontOptions.map((f) => (
                      <SelectItem className="text-xs" key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Theme Mode</Label>
              <ToggleGroup
                onValueChange={(value) => {
                  const mode = getSingleToggleValue<ThemeMode>(value);
                  if (!mode) {
                    return;
                  }
                  onThemeModeChange(mode);
                }}
                size="sm"
                spacing={0}
                value={[themeMode]}
                variant="outline"
              >
                <ToggleGroupItem aria-label="Toggle light" value="light">
                  Light
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Toggle dark" value="dark">
                  Dark
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Toggle system" value="system">
                  System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Page Layout</Label>
              <ToggleGroup
                onValueChange={(value) => {
                  const layout = getSingleToggleValue<ContentLayout>(value);
                  if (!layout) {
                    return;
                  }
                  onContentLayoutChange(layout);
                }}
                size="sm"
                spacing={0}
                value={[contentLayout]}
                variant="outline"
              >
                <ToggleGroupItem aria-label="Toggle centered" value="centered">
                  Centered
                </ToggleGroupItem>
                <ToggleGroupItem
                  aria-label="Toggle full-width"
                  value="full-width"
                >
                  Full Width
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Navbar Behavior</Label>
              <ToggleGroup
                onValueChange={(value) => {
                  const style = getSingleToggleValue<NavbarStyle>(value);
                  if (!style) {
                    return;
                  }
                  onNavbarStyleChange(style);
                }}
                size="sm"
                spacing={0}
                value={[navbarStyle]}
                variant="outline"
              >
                <ToggleGroupItem aria-label="Toggle sticky" value="sticky">
                  Sticky
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Toggle scroll" value="scroll">
                  Scroll
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">Sidebar Style</Label>
              <ToggleGroup
                onValueChange={(value) => {
                  const nextVariant =
                    getSingleToggleValue<SidebarVariant>(value);
                  if (!nextVariant) {
                    return;
                  }
                  onSidebarStyleChange(nextVariant);
                }}
                size="sm"
                spacing={0}
                value={[variant]}
                variant="outline"
              >
                <ToggleGroupItem aria-label="Toggle inset" value="inset">
                  Inset
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Toggle sidebar" value="sidebar">
                  Sidebar
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Toggle floating" value="floating">
                  Floating
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs">
                Sidebar Collapse Mode
              </Label>
              <ToggleGroup
                onValueChange={(value) => {
                  const nextCollapsible =
                    getSingleToggleValue<SidebarCollapsible>(value);
                  if (!nextCollapsible) {
                    return;
                  }
                  onSidebarCollapseModeChange(nextCollapsible);
                }}
                size="sm"
                spacing={0}
                value={[collapsible]}
                variant="outline"
              >
                <ToggleGroupItem aria-label="Toggle icon" value="icon">
                  Icon
                </ToggleGroupItem>
                <ToggleGroupItem
                  aria-label="Toggle offcanvas"
                  value="offcanvas"
                >
                  OffCanvas
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Button
              className="w-full text-xs"
              onClick={handleRestore}
              size="sm"
              type="button"
              variant="outline"
            >
              Restore Defaults
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
