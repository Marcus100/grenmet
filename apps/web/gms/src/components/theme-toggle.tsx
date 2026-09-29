"use client";

import { usePreferencesStore } from "@barrelsgd/theme/components/preferences-provider";
import { persistPreference } from "@barrelsgd/theme/lib/preferences-storage";
import type { ThemeMode } from "@barrelsgd/theme/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  { mode: "light", label: "Light", Icon: SunIcon },
  { mode: "dark", label: "Dark", Icon: MoonIcon },
  { mode: "system", label: "Auto", Icon: MonitorIcon },
] as const satisfies readonly {
  mode: ThemeMode;
  label: string;
  Icon: unknown;
}[];

/**
 * Light / Dark / Auto. Three visible choices rather than a cycling icon, so the
 * current setting is always readable. "Auto" follows the device. The choice is
 * saved by @barrelsgd/theme and applied before paint on the next visit.
 */
export function ThemeToggle({
  tone = "masthead",
}: {
  /** "masthead" sits on navy; "drawer" on the page surface. */
  tone?: "masthead" | "drawer";
}) {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const choose = (mode: ThemeMode) => {
    setThemeMode(mode);
    persistPreference("theme_mode", mode).catch(() => undefined);
  };

  return (
    <fieldset
      className={cn(
        "flex w-fit items-center gap-0.5 rounded-md p-0.5",
        tone === "masthead"
          ? "border border-gm-text-inverse/25"
          : "border border-gm-border"
      )}
    >
      <legend className="sr-only">Colour theme</legend>
      {MODES.map(({ mode, label, Icon }) => {
        const active = themeMode === mode;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-caption leading-caption outline-none focus-visible:ring-2",
              tone === "masthead"
                ? "focus-visible:ring-gm-lime"
                : "min-h-9 focus-visible:ring-gm-blue",
              active &&
                tone === "masthead" &&
                "bg-gm-text-inverse text-gm-navy",
              active &&
                tone === "drawer" &&
                "bg-gm-navy text-gm-text-inverse dark:bg-gm-blue-ink dark:text-gm-navy",
              !active && tone === "drawer" && "text-gm-text-secondary"
            )}
            key={mode}
            onClick={() => choose(mode)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </button>
        );
      })}
    </fieldset>
  );
}
