"use client";

import { usePreferencesStore } from "@grenmet/theme/components/preferences-provider";
import { persistPreference } from "@grenmet/theme/lib/preferences-storage";
import { Button } from "@grenmet/ui/components/ui/button";
import { Monitor, Moon, Sun } from "lucide-react";

const THEME_CYCLE = ["light", "dark", "system"] as const;

export function ThemeSwitcher() {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf(themeMode);
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];

    setThemeMode(nextTheme);
    persistPreference("theme_mode", nextTheme).catch(() => undefined);
  };

  return (
    <Button
      aria-label={`Current theme: ${themeMode}. Click to cycle themes`}
      onClick={cycleTheme}
      size="icon"
    >
      {/* SYSTEM */}
      <Monitor className="hidden [html[data-theme-mode=system]_&]:block" />

      {/* DARK (resolved) */}
      <Sun className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />

      {/* LIGHT (resolved) */}
      <Moon className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
    </Button>
  );
}
