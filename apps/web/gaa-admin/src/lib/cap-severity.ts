import type {
  CapCertainty,
  CapSeverity,
  CapUrgency,
} from "@barrelsgd/api-client";

/**
 * Single source of truth for severity ordering and colour. severity-badge,
 * risk-ladder, the dashboard stripe and the map layers all read from this so
 * "what Severe looks like" can never drift between them.
 */
export const SEVERITY_ORDER: readonly CapSeverity[] = [
  "Unknown",
  "Minor",
  "Moderate",
  "Severe",
  "Extreme",
];

export const URGENCY_ORDER: readonly CapUrgency[] = [
  "Unknown",
  "Past",
  "Future",
  "Expected",
  "Immediate",
];

export const CERTAINTY_ORDER: readonly CapCertainty[] = [
  "Unknown",
  "Unlikely",
  "Possible",
  "Likely",
  "Observed",
];

/** Matches badgeVariants in @barrelsgd/ui — Extreme and Severe both read as "solid-error". */
export const SEVERITY_BADGE_VARIANT: Record<CapSeverity, string> = {
  Extreme: "solid-error",
  Severe: "solid-error",
  Moderate: "solid-warning",
  Minor: "solid-success",
  Unknown: "light-light",
};

/** --gm-risk-* custom property for each severity, for contexts (MapLibre paint, ladder fill) that need a literal CSS value rather than a Tailwind class. */
export const SEVERITY_RISK_VAR: Record<CapSeverity, string> = {
  Extreme: "var(--gm-risk-red)",
  Severe: "var(--gm-risk-red)",
  Moderate: "var(--gm-risk-amber)",
  Minor: "var(--gm-risk-green)",
  Unknown: "var(--gm-risk-grey)",
};

/** Resolved hex per severity, for MapLibre paint expressions (style JSON can't consume CSS custom properties). */
export const SEVERITY_HEX: Record<CapSeverity, string> = {
  Extreme: "#a3002a",
  Severe: "#cc0033",
  Moderate: "#ff9900",
  Minor: "#00843d",
  Unknown: "#dcdcdc",
};

export function severityRank(severity: CapSeverity | null | undefined): number {
  if (!severity) {
    return 0;
  }
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? 0 : index;
}

/** For compositing multiple active alerts on one map: the more severe alert wins the shared area. */
export function highestSeverity(
  severities: (CapSeverity | null | undefined)[]
): CapSeverity {
  let best: CapSeverity = "Unknown";
  for (const severity of severities) {
    if (severity && severityRank(severity) > severityRank(best)) {
      best = severity;
    }
  }
  return best;
}
