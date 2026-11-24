/**
 * Impact-based warning levels — the colour scheme the public warning surfaces
 * share. The mapping lives in `@barrelsgd/gms/warning-levels` so the CAP hub
 * and this site cannot drift apart; colour is never the only signal: every
 * level carries a label, per the Warning Pattern Checklist in
 * `docs/design-system.md`.
 */
export {
  WARNING_LEVEL_COLOUR_NAME,
  WARNING_LEVEL_GUIDANCE,
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_SURFACE,
  WARNING_LEVEL_SWATCH,
  type WarningLevel,
  warningLevelHeading,
} from "@barrelsgd/gms/warning-levels";
