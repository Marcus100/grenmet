/**
 * The one public warning-level mapping, shared by the CAP hub and the GMS
 * site so the public sees exactly the colour the forecaster issued.
 * CAP severity follows the desk pairing (MeteoAlarm, see the cap app's
 * `cap-severity.ts`): Minor = Green, Moderate = Yellow, Severe = Orange
 * (the amber token), Extreme = Red. Colour is never the only signal: the
 * colour name and the action words are both printed.
 */
export type WarningLevel =
  | "none"
  | "green"
  | "be-aware"
  | "be-prepared"
  | "take-action"
  | "unknown";

/** CAP severity words; `Unknown` covers a missing or unrecognised value. */
export type WarningSeverity =
  | "Extreme"
  | "Severe"
  | "Moderate"
  | "Minor"
  | "Unknown";

/** Action words: Yellow "Be aware", Orange "Be prepared", Red "Take action now". */
export const WARNING_LEVEL_LABEL: Record<WarningLevel, string> = {
  none: "No active alerts",
  green: "Green alert",
  "be-aware": "Be aware",
  "be-prepared": "Be prepared",
  "take-action": "Take action now",
  unknown: "Status unavailable",
};

/** The issued colour as a word, printed beside the action words. */
export const WARNING_LEVEL_COLOUR_NAME: Record<WarningLevel, string> = {
  none: "Green",
  green: "Green",
  "be-aware": "Yellow",
  "be-prepared": "Orange",
  "take-action": "Red",
  unknown: "Grey",
};

/**
 * Header surface for each level. Foreground is paired with its background in
 * `foundation.css`, so these stay legible without a per-use contrast check.
 */
export const WARNING_LEVEL_SURFACE: Record<WarningLevel, string> = {
  none: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  green: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  "be-aware": "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
  "be-prepared": "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  "take-action": "bg-gm-warning-red-bg text-gm-warning-red-fg",
  unknown: "bg-gm-warning-grey-bg text-gm-warning-grey-fg",
};

/** One line of public guidance per level, for legends and status bands. */
export const WARNING_LEVEL_GUIDANCE: Record<WarningLevel, string> = {
  none: "Nothing in effect. Plan as normal.",
  green: "Low impact expected. Stay informed.",
  "be-aware": "Weather could affect some activities. Stay informed.",
  "be-prepared": "Disruption is likely. Plan ahead and prepare.",
  "take-action": "Dangerous weather. Act now to protect life and property.",
  unknown: "We cannot confirm the current warning status.",
};

/** Solid swatch per level, for legends and card stripes. */
export const WARNING_LEVEL_SWATCH: Record<WarningLevel, string> = {
  none: "bg-gm-warning-green-bg",
  green: "bg-gm-warning-green-bg",
  "be-aware": "bg-gm-warning-yellow-bg",
  "be-prepared": "bg-gm-warning-amber-bg",
  "take-action": "bg-gm-warning-red-bg",
  unknown: "bg-gm-warning-grey-bg",
};

/** Map fill and outline per level, from the same tokens as the surfaces. */
export const WARNING_LEVEL_MAP_FILL: Record<WarningLevel, string> = {
  none: "fill-gm-warning-green-bg stroke-gm-warning-green-border",
  green: "fill-gm-warning-green-bg stroke-gm-warning-green-border",
  "be-aware": "fill-gm-warning-yellow-bg stroke-gm-warning-yellow-border",
  "be-prepared": "fill-gm-warning-amber-bg stroke-gm-warning-amber-border",
  "take-action": "fill-gm-warning-red-bg stroke-gm-warning-red-border",
  unknown: "fill-gm-warning-grey-bg stroke-gm-warning-grey-border",
};

/** The level a CAP severity is shown as: exactly the issued colour. */
export function severityLevel(severity: WarningSeverity): WarningLevel {
  switch (severity) {
    case "Extreme":
      return "take-action";
    case "Severe":
      return "be-prepared";
    case "Moderate":
      return "be-aware";
    case "Minor":
      return "green";
    default:
      // An unreadable severity is still worth being aware of, never clear.
      return "be-aware";
  }
}
