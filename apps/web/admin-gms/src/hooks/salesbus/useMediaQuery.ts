"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);

    // Set initial value
    setMatches(media.matches);

    // Create listener
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener
    media.addEventListener("change", listener);

    // Cleanup
    return () => {
      media.removeEventListener("change", listener);
    };
  }, [query]);

  return matches;
}

// Preset hooks for common breakpoints
export function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 640px)");
}

export function useIsLandscape(): boolean {
  return useMediaQuery("(orientation: landscape)");
}

export function useIsTabletLandscape(): boolean {
  return useMediaQuery("(min-width: 640px) and (orientation: landscape)");
}
