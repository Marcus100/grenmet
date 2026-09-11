import type { ProductKind } from "@barrelsgd/gms/products";
import { type ProductField, productFields } from "@barrelsgd/gms/products";

/**
 * Impact-based forecast fields hidden from the authoring form and the PDF.
 *
 * These stay defined in `@barrelsgd/gms/products` on purpose: the shared schema
 * backs the public GMS site, the public products API and the wxproducts DB, and
 * products already saved carry values for them. Hiding them here removes them
 * from the two surfaces GMS asked for without dropping stored data.
 */
const HIDDEN_SECTIONS: ReadonlySet<string> = new Set([
  "Weather impacts",
  "Wind impacts",
  "Marine impacts",
  "Heat impacts",
  "Dust impacts",
  "Risk assessment",
]);

const HIDDEN_KEYS: ReadonlySet<string> = new Set([
  "weatherAlert",
  "windAlert",
  "marineAlert",
]);

/** True when a field should not be rendered in the form or the document. */
export function isHiddenProductField(field: ProductField): boolean {
  return HIDDEN_SECTIONS.has(field.section) || HIDDEN_KEYS.has(field.key);
}

/** `productFields` minus the hidden impact/alert fields. */
export function visibleProductFields(kind: ProductKind): ProductField[] {
  return productFields(kind).filter((field) => !isHiddenProductField(field));
}

/**
 * The exact `validateProduct` errors raised for fields we hide.
 *
 * `validateProduct` walks the full shared field list, so the three required
 * "Risk assessment" fields would otherwise block publishing with errors about
 * inputs the forecaster can no longer see. Built from the same predicate as the
 * form so the two can never drift.
 */
export function hiddenRequiredErrors(kind: ProductKind): Set<string> {
  return new Set(
    productFields(kind)
      .filter(isHiddenProductField)
      .filter((field) => field.required)
      .map((field) => `${field.section}: ${field.label} is required`)
  );
}
