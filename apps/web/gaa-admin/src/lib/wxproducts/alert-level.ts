import { isBulletin, type ProductKind } from "@barrelsgd/gms/products";

/**
 * GMS alerts are green only (ADR-0051). A draft saved earlier at yellow or
 * above must be lowered to green or raised to a CAP warning before it can be
 * saved again; older saved revisions are never rewritten.
 */
export function isAboveGreen(kind: ProductKind, level: string | undefined) {
  return isBulletin(kind) && !!level && level !== "Green";
}

export const ABOVE_GREEN_MESSAGE =
  "This alert is at a level above green. GMS alerts are green only now: raise it to a warning (a CAP alert) or change it to green before saving.";
