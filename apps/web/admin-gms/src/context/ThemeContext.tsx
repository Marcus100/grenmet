"use client";

import { useTheme as useNextTheme } from "next-themes";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

/**
 * Custom hook that wraps next-themes for backwards compatibility.
 * Provides the same API as the original custom ThemeContext.
 */
export const useTheme = (): ThemeContextType => {
  const { resolvedTheme, setTheme } = useNextTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return {
    theme: (resolvedTheme ?? "light") as Theme,
    toggleTheme,
  };
};
