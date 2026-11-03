"use client";

import { usePreferencesStore } from "@barrelsgd/theme/components/preferences-provider";
import { persistPreference } from "@barrelsgd/theme/lib/preferences-storage";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** The two choices the public site offers (owner, 1 Nov 2026, #1001). */
type SiteTheme = "light" | "dark";

/**
 * One icon button that switches between light and dark. The site opens in
 * light and does not follow the device. The icon shows the theme a click
 * switches to; the `dark` class on <html> (set by @barrelsgd/theme) picks it
 * with CSS, so it never mismatches on hydration.
 */
export function ThemeToggle({
  tone = "masthead",
}: {
  /** "masthead" sits on navy; "drawer" on the page surface. */
  tone?: "masthead" | "drawer";
}) {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  // A visitor who stored the old "system" choice moves to light, the new
  // default. The site no longer offers Auto, so "system" is never kept.
  useEffect(() => {
    if (themeMode !== "system") return;
    setThemeMode("light");
    persistPreference("theme_mode", "light").catch(() => undefined);
  }, [themeMode, setThemeMode]);

  const current: SiteTheme = themeMode === "dark" ? "dark" : "light";
  const next: SiteTheme = current === "dark" ? "light" : "dark";

  const switchTheme = () => {
    setThemeMode(next);
    persistPreference("theme_mode", next).catch(() => undefined);
  };

  return (
    <Button
      aria-label={`Current theme: ${current}. Click to switch to ${next}`}
      // A plain icon like Search beside it: no filled chip, a faint hover.
      className={cn(
        tone === "masthead"
          ? "text-gm-text-inverse hover:bg-gm-text-inverse/10 hover:text-gm-text-inverse focus-visible:ring-gm-lime size-11 [&_svg]:size-5"
          : "focus-visible:ring-gm-blue"
      )}
      onClick={switchTheme}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="block dark:hidden" />
    </Button>
  );
}
