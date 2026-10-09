"use client";

import { usePreferencesStore } from "@barrelsgd/theme/components/preferences-provider";
import { persistPreference } from "@barrelsgd/theme/lib/preferences-storage";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_CYCLE = ["light", "dark", "system"] as const;
const THEME_LABEL = { light: "light", dark: "dark", system: "auto" } as const;

/**
 * One icon button that cycles light → dark → auto, like gaa-admin's
 * ThemeSwitcher. The icon is picked by CSS from `data-theme-mode` on <html>
 * (set before paint by @barrelsgd/theme), so it never mismatches on hydration.
 */
export function ThemeToggle({
  tone = "masthead",
}: {
  /** "masthead" sits on navy; "drawer" on the page surface. */
  tone?: "masthead" | "drawer";
}) {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const cycleTheme = () => {
    const next =
      THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
    setThemeMode(next);
    persistPreference("theme_mode", next).catch(() => undefined);
  };

  return (
    <Button
      aria-label={`Current theme: ${THEME_LABEL[themeMode]}. Click to cycle themes`}
      className={cn(
        tone === "masthead"
          ? "size-11 focus-visible:ring-gm-lime"
          : "focus-visible:ring-gm-blue"
      )}
      onClick={cycleTheme}
      size="icon"
      type="button"
    >
      <Monitor
        aria-hidden="true"
        className="hidden [html[data-theme-mode=system]_&]:block"
      />
      <Sun
        aria-hidden="true"
        className="hidden dark:block [html[data-theme-mode=system]_&]:hidden"
      />
      <Moon
        aria-hidden="true"
        className="block dark:hidden [html[data-theme-mode=system]_&]:hidden"
      />
    </Button>
  );
}
