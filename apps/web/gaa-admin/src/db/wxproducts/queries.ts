import "server-only";

import { eq } from "drizzle-orm";
import { wxproductsDb as db } from "@/db/wxproducts/index";
import {
  fromMorningRows,
  toMorningRows,
} from "@/db/wxproducts/morning-mapping";
import type { MorningForecastProduct } from "@/db/wxproducts/schema/morning";
import { morningProducts } from "@/db/wxproducts/schema/morning";
import { products } from "@/db/wxproducts/schema/product-metadata";

/**
 * Writes a morning forecast, replacing any previous version of the same
 * `product_id`. Both rows move together in one transaction: a parent `products`
 * row with no detail row would present as a product that exists but has no
 * forecast in it.
 *
 * `suiteId` must already exist in `product_suites` — the foreign key is not
 * null, and inventing a suite here would hide a caller that has not decided
 * which suite the product belongs to.
 */
export async function saveMorningForecast(
  product: MorningForecastProduct,
  suiteId: string
): Promise<{ productId: string }> {
  const rows = toMorningRows(product, suiteId);

  await db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(products)
      .values(rows.product)
      .onConflictDoUpdate({
        target: products.productId,
        set: {
          issueDatetimeUtc: rows.product.issueDatetimeUtc,
          links: rows.product.links,
          metadata: rows.product.metadata,
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id });

    await tx
      .insert(morningProducts)
      .values({ ...rows.detail, productRef: parent.id })
      .onConflictDoUpdate({
        target: morningProducts.productRef,
        set: { ...rows.detail, updatedAt: new Date() },
      });
  });

  return { productId: rows.product.productId };
}

/** Reads one morning forecast by its public product id. */
export async function getMorningForecast(
  productId: string
): Promise<MorningForecastProduct | null> {
  const [row] = await db
    .select({
      elements: morningProducts.elements,
      headline: morningProducts.headline,
      links: products.links,
      metadata: products.metadata,
      productNotesAdvisories: morningProducts.productNotesAdvisories,
    })
    .from(products)
    .innerJoin(morningProducts, eq(morningProducts.productRef, products.id))
    .where(eq(products.productId, productId))
    .limit(1);

  if (!row) {
    return null;
  }

  return fromMorningRows({
    detail: {
      elements: row.elements,
      headline: row.headline,
      productNotesAdvisories: row.productNotesAdvisories,
    },
    links: row.links,
    metadata: row.metadata,
  });
}
