/**
 * Drizzle ORM relations — all cross-table relationships defined in one place
 * to avoid circular imports between domain files.
 */

import { relations } from "drizzle-orm";
import { capAlerts, capBundles } from "@/db/schema/cap";
import { eveningProducts } from "@/db/schema/evening";
import { hourlySummaries } from "@/db/schema/hourly";
import { ibfAssessments } from "@/db/schema/ibf";
import { marineProducts } from "@/db/schema/marine";
import { aviationObservations } from "@/db/schema/metarSpeci";
import { middayProducts } from "@/db/schema/midday";
import { morningProducts } from "@/db/schema/morning";
import { tropicalOutlookProducts } from "@/db/schema/outlook";
import { productSuites, products } from "@/db/schema/product-metadata";
import { synopObservations } from "@/db/schema/synop";

// ── Suite ─────────────────────────────────────────────────────────────────────

export const productSuitesRelations = relations(productSuites, ({ many }) => ({
  products: many(products),
  capBundles: many(capBundles),
}));

// ── Products hub ──────────────────────────────────────────────────────────────

export const productsRelations = relations(products, ({ one, many }) => ({
  suite: one(productSuites, {
    fields: [products.suiteId],
    references: [productSuites.suiteId],
  }),
  morningProduct: one(morningProducts),
  middayProduct: one(middayProducts),
  eveningProduct: one(eveningProducts),
  marineProduct: one(marineProducts),
  tropicalOutlookProduct: one(tropicalOutlookProducts),
  ibfAssessments: many(ibfAssessments),
}));

// ── Spoke tables ──────────────────────────────────────────────────────────────

export const morningProductsRelations = relations(
  morningProducts,
  ({ one }) => ({
    product: one(products, {
      fields: [morningProducts.productRef],
      references: [products.id],
    }),
  })
);

export const middayProductsRelations = relations(middayProducts, ({ one }) => ({
  product: one(products, {
    fields: [middayProducts.productRef],
    references: [products.id],
  }),
}));

export const eveningProductsRelations = relations(
  eveningProducts,
  ({ one }) => ({
    product: one(products, {
      fields: [eveningProducts.productRef],
      references: [products.id],
    }),
  })
);

export const marineProductsRelations = relations(marineProducts, ({ one }) => ({
  product: one(products, {
    fields: [marineProducts.productRef],
    references: [products.id],
  }),
}));

export const tropicalOutlookProductsRelations = relations(
  tropicalOutlookProducts,
  ({ one }) => ({
    product: one(products, {
      fields: [tropicalOutlookProducts.productRef],
      references: [products.id],
    }),
  })
);

// ── Observations ──────────────────────────────────────────────────────────────

export const aviationObservationsRelations = relations(
  aviationObservations,
  ({ many }) => ({
    hourlySummaries: many(hourlySummaries),
  })
);

export const synopObservationsRelations = relations(
  synopObservations,
  ({ many }) => ({
    hourlySummaries: many(hourlySummaries),
  })
);

// ── Derived ───────────────────────────────────────────────────────────────────

export const hourlySummariesRelations = relations(
  hourlySummaries,
  ({ one }) => ({
    sourceMetar: one(aviationObservations, {
      fields: [hourlySummaries.sourceMetarId],
      references: [aviationObservations.id],
    }),
    sourceSynop: one(synopObservations, {
      fields: [hourlySummaries.sourceSynopId],
      references: [synopObservations.id],
    }),
  })
);

// ── Alert pipeline ────────────────────────────────────────────────────────────

export const ibfAssessmentsRelations = relations(
  ibfAssessments,
  ({ one, many }) => ({
    product: one(products, {
      fields: [ibfAssessments.productId],
      references: [products.productId],
    }),
    capAlerts: many(capAlerts),
  })
);

export const capBundlesRelations = relations(capBundles, ({ one, many }) => ({
  suite: one(productSuites, {
    fields: [capBundles.suiteId],
    references: [productSuites.suiteId],
  }),
  capAlerts: many(capAlerts),
}));

export const capAlertsRelations = relations(capAlerts, ({ one }) => ({
  bundle: one(capBundles, {
    fields: [capAlerts.bundleId],
    references: [capBundles.id],
  }),
  ibfAssessment: one(ibfAssessments, {
    fields: [capAlerts.ibfAssessmentId],
    references: [ibfAssessments.ibfAssessmentId],
  }),
}));
