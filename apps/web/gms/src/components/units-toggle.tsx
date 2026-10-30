"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { captureEvent } from "@barrelsgd/ui/lib/analytics-runtime";
import {
  UNITS_SWITCHED_EVENT,
  unitsSwitchedProperties,
} from "@/lib/analytics-events";
import {
  DEFAULT_UNITS,
  isUnitSystem,
  UNITS_STORAGE_KEY,
  type UnitSystem,
} from "@/lib/units";
import { cn } from "@/lib/utils";

/** The system the page is showing: the saved or default one on <html>. */
function current(): UnitSystem {
  const value = document.documentElement.getAttribute("data-units");
  return isUnitSystem(value) ? value : DEFAULT_UNITS;
}

/**
 * Switches every measurement on the site between imperial and metric and
 * remembers the choice on this device. It holds no state of its own: it flips
 * <html data-units> and CSS shows the matching rendering of each figure (see
 * `components/measure.tsx`), so the button and the page can never disagree.
 */
export function UnitsToggle({
  tone = "masthead",
}: {
  /** "masthead" sits on navy; "drawer" on the page surface. */
  tone?: "masthead" | "drawer";
}) {
  function toggle() {
    const next: UnitSystem = current() === "metric" ? "imperial" : "metric";
    document.documentElement.setAttribute("data-units", next);
    try {
      window.localStorage.setItem(UNITS_STORAGE_KEY, next);
    } catch {
      // The choice still applies to this visit if storage is blocked.
    }
    // Counts only: which system was chosen. Sent only with analytics consent.
    captureEvent(UNITS_SWITCHED_EVENT, unitsSwitchedProperties(next));
  }

  return (
    <Button
      className={cn(
        "text-body-sm leading-body-sm min-w-11 px-2 font-semibold",
        tone === "masthead"
          ? "text-gm-text-inverse hover:bg-gm-text-inverse/10 hover:text-gm-text-inverse focus-visible:ring-gm-lime h-11"
          : "focus-visible:ring-gm-blue"
      )}
      onClick={toggle}
      type="button"
      variant="ghost"
    >
      <span aria-hidden="true" data-units-only="imperial">
        °F
      </span>
      <span aria-hidden="true" data-units-only="metric">
        °C
      </span>
      <span className="sr-only" data-units-only="imperial">
        Units: imperial (°F, mph, feet). Switch to metric.
      </span>
      <span className="sr-only" data-units-only="metric">
        Units: metric (°C, km/h, metres). Switch to imperial.
      </span>
    </Button>
  );
}
