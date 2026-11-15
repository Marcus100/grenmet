"use client";

import { usePreferencesStore } from "@barrelsgd/theme/components/preferences-provider";
import { Toaster } from "@barrelsgd/ui/components/ui/sonner";

/**
 * The one Toaster for every folded module (cap, hr, wxwatch, wxproducts,
 * salesbus). `toast()` from "sonner" shows nothing unless a Toaster is
 * mounted, so this sits in the root layout and nowhere else: a second one
 * would show every toast twice. The theme follows the staff member's own
 * light or dark preference, not the operating system's.
 */
export function AppToaster() {
  const theme = usePreferencesStore((state) => state.resolvedThemeMode);
  return <Toaster position="bottom-right" theme={theme} />;
}
