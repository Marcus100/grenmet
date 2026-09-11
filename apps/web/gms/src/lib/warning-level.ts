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
  none: "No warnings in effect",
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
