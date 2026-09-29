/**
 * Impact-based warning levels — the four-colour scheme the public warning
 * surfaces share. Colour is never the only signal: every level carries a
 * label, per the Warning Pattern Checklist in `docs/design-system.md`.
 */
export type WarningLevel =
  | "none"
  | "be-aware"
  | "be-prepared"
  | "take-action"
  | "unknown";

export const WARNING_LEVEL_LABEL: Record<WarningLevel, string> = {
  none: "No active warnings",
  "be-aware": "Be aware",
  "be-prepared": "Be prepared",
  "take-action": "Take action now",
  unknown: "Status unavailable",
};

/**
 * Header surface for each level. Foreground is paired with its background in
 * `foundation.css`, so these stay legible without a per-use contrast check.
 */
export const WARNING_LEVEL_SURFACE: Record<WarningLevel, string> = {
  none: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  "be-aware": "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
  "be-prepared": "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  "take-action": "bg-gm-warning-red-bg text-gm-warning-red-fg",
  unknown: "bg-gm-warning-grey-bg text-gm-warning-grey-fg",
};

/** One line of public guidance per level, for legends and status bands. */
export const WARNING_LEVEL_GUIDANCE: Record<WarningLevel, string> = {
  none: "No significant weather is expected.",
  "be-aware": "Weather could affect some activities. Stay informed.",
  "be-prepared": "Disruption is likely. Plan ahead and prepare.",
  "take-action": "Dangerous weather. Act now to protect life and property.",
  unknown: "We cannot confirm the current warning status.",
};

/** Solid swatch per level, for legends and card stripes. */
export const WARNING_LEVEL_SWATCH: Record<WarningLevel, string> = {
  none: "bg-gm-warning-green-bg",
  "be-aware": "bg-gm-warning-yellow-bg",
  "be-prepared": "bg-gm-warning-amber-bg",
  "take-action": "bg-gm-warning-red-bg",
  unknown: "bg-gm-warning-grey-bg",
};
