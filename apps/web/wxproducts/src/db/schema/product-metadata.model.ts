/**
 * Product metadata Drizzle models — productSuites and products tables.
 */

import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/schema/db-helpers";
import type { Suite } from "@/db/schema/suite.schema";
import type { ProductLinks, ProductMetadata } from "@/db/schema/product-metadata.schema";

/** Authored forecast product types. Aviation obs / SYNOP have standalone tables. */
export const productTypeEnum = pgEnum("product_type", [
  "evening_forecast",
  "marine_bulletin",
  "midday_weather_report",
  "morning_forecast",
  "tropical_weather_outlook",
]);

export const productStatusEnum = pgEnum("product_status", [
  "archived",
  "operational",
  "test",
  "training",
]);

export const productSuites = pgTable(
  "product_suites",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    suiteId: t.text().notNull(),
    suiteType: t.text().notNull().default("daily_product_suite"),
    schemaFamily: t.text(),
    schemaVersion: t.text(),
    suiteIssueDatetimeUtc: t.timestamp({ withTimezone: true }),
    fullSuite: t.jsonb().$type<Suite>().notNull(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("product_suites_suite_id_idx").on(table.suiteId),
    index("product_suites_issue_datetime_idx").on(table.suiteIssueDatetimeUtc),
  ]
);

export const products = pgTable(
  "products",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    productId: t.text().notNull(),
    productType: productTypeEnum().notNull(),
    suiteId: t
      .text()
      .notNull()
      .references(() => productSuites.suiteId),
    issueDatetimeUtc: t.timestamp({ withTimezone: true }),
    metadata: t.jsonb().$type<ProductMetadata>(),
    links: t.jsonb().$type<ProductLinks>(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("products_product_id_idx").on(table.productId),
    index("products_suite_id_idx").on(table.suiteId),
    index("products_issue_datetime_idx").on(table.issueDatetimeUtc),
    index("products_type_idx").on(table.productType),
  ]
);

export type ProductSuite = typeof productSuites.$inferSelect;
export type ProductSuiteInsert = typeof productSuites.$inferInsert;
export type ProductRow = typeof products.$inferSelect;
export type ProductRowInsert = typeof products.$inferInsert;
