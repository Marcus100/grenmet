/**
 * Pure mapping between the morning-forecast domain product and its database
 * rows. Kept apart from `queries.ts` so the field mapping — the part that
 * silently corrupts data when it drifts — can be tested without a database.
 */

import type { MorningForecastProduct } from "@/db/wxproducts/schema/morning";
import type {
  ProductLinks,
  ProductMetadata,
} from "@/db/wxproducts/schema/product-metadata";

export interface MorningRows {
  detail: {
    elements: MorningForecastProduct["forecast"]["elements"];
    headline: string;
    productNotesAdvisories: string[] | null;
  };
  product: {
    issueDatetimeUtc: Date | null;
    links: ProductLinks;
    metadata: ProductMetadata;
    productId: string;
    productType: ProductMetadata["product_type"];
    suiteId: string;
  };
}

/** Splits a domain product into the parent `products` row and its detail row. */
export function toMorningRows(
  product: MorningForecastProduct,
  suiteId: string
): MorningRows {
  const meta = product.product_metadata;
  const issued = new Date(meta.issue_datetime_utc);

  return {
    detail: {
      elements: product.forecast.elements,
      headline: product.forecast.headline,
      // The column stores only the advisory list. `outlook_text` is deliberately
      // not persisted here: it has no column, and silently dropping it inside a
      // jsonb blob would make it look saved.
      productNotesAdvisories:
        product.forecast.product_notes?.advisories_text ?? null,
    },
    product: {
      issueDatetimeUtc: Number.isNaN(issued.getTime()) ? null : issued,
      links: product.links,
      metadata: meta,
      productId: meta.product_id,
      productType: meta.product_type,
      suiteId,
    },
  };
}

/** Rebuilds the domain product from its stored rows. */
export function fromMorningRows(rows: {
  detail: MorningRows["detail"];
  links: ProductLinks | null;
  metadata: ProductMetadata | null;
}): MorningForecastProduct | null {
  if (!(rows.metadata && rows.links)) {
    return null;
  }
  const advisories = rows.detail.productNotesAdvisories;
  return {
    forecast: {
      elements: rows.detail.elements,
      headline: rows.detail.headline,
      product_notes: advisories ? { advisories_text: advisories } : null,
    },
    links: rows.links,
    product_metadata: rows.metadata,
  };
}
