/**
 * MapLibre paint for the parish fill layer, as a pure function so it can be
 * unit-tested without a WebGL map.
 *
 * A MapLibre `match` expression needs at least one label/output pair plus a
 * fallback: ["match", input, label, output, fallback]. With nothing selected
 * that shape collapses to a plain colour string, because an expression with
 * no pairs is rejected by the style validator and then the whole fill layer
 * is dropped from the map.
 */

/** A MapLibre paint value: a literal colour, or a style-spec expression array. */
export type ParishFillPaint = string | readonly unknown[];

export interface ParishFillPaintInput {
  /** Flat colour for parishes that are not selected (theme-dependent). */
  landColour: string;
  /** Highlight colour for the selected parishes. */
  selectedColour: string;
  /** Parish ids (GeoJSON `properties.id`) to highlight. */
  selectedIds: readonly string[];
}

export function buildParishFillPaint({
  landColour,
  selectedIds,
  selectedColour,
}: ParishFillPaintInput): ParishFillPaint {
  if (selectedIds.length === 0) {
    return landColour;
  }
  const pairs = [...new Set(selectedIds)].flatMap((id) => [id, selectedColour]);
  return ["match", ["get", "id"], ...pairs, landColour];
}
