import "server-only";

import { eq } from "drizzle-orm";
import { wxproductsDb as db } from "@/db/wxproducts/index";
import {
  fromMorningRows,
  toMorningRows,
} from "@/db/wxproducts/morning-mapping";
import type { MorningForecastProduct } from "@/db/wxproducts/schema/morning";
import { morningProducts } from "@/db/wxproducts/schema/morning";
import {
  productSuites,
  products,
} from "@/db/wxproducts/schema/product-metadata";
import type { Suite } from "@/db/wxproducts/schema/suite-types";

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

/**
 * Creates the day's suite if it is not there yet, so the first forecast of the
 * morning is not rejected for a container nobody was asked to make. Concurrent
 * first saves are safe: the unique suite id makes the second one a no-op rather
 * than a duplicate.
 */
export async function ensureDailySuite(
  suiteId: string,
  suite: Suite,
  issuedAt: Date
): Promise<void> {
  await db
    .insert(productSuites)
    .values({
      fullSuite: suite,
      schemaFamily: suite.suite_metadata.schema_family,
      schemaVersion: suite.suite_metadata.schema_version,
      suiteId,
      suiteIssueDatetimeUtc: issuedAt,
      suiteType: "daily_product_suite",
    })
    .onConflictDoNothing({ target: productSuites.suiteId });
}

/**
 * The version already stored for a product id, or null when this is a first
 * issue. Callers increment from it, so a reissue never silently restarts at 1
 * and loses the fact that the forecast was amended.
 */
export async function getStoredVersion(
  productId: string
): Promise<number | null> {
  const [row] = await db
    .select({ metadata: products.metadata })
    .from(products)
    .where(eq(products.productId, productId))
    .limit(1);
  return row?.metadata?.versioning?.version ?? null;
}
