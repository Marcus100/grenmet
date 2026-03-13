import { relations } from "drizzle-orm";
/**
 * Drizzle schema for wxproducts Postgres DB.
 *
 * Product data is split by type: one row in `products` (id, product_id, product_type,
 * suite_id, issue_datetime_utc, metadata) and one row in the corresponding payload table
 * (marine_products, morning_products, midday_products, evening_products,
 * tropical_outlook_products) linked by product_ref -> products.id.
 * All payload table columns are explicit so table fields are visible and queryable.
 */
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ElementsBlock } from "../app/schema/elements";
import type { METARReport, SPECIReport } from "../app/schema/metarSpeci";
import type { ProductMetadata } from "../app/schema/product-metadata";
import type { Suite } from "../app/schema/suite-types";
import type { TAFReport } from "../app/schema/taf";

export const productSuites = pgTable(
  "product_suites",
  {
    id: serial("id").primaryKey(),
    suiteId: text("suite_id").notNull(),
    suiteType: text("suite_type").notNull().default("daily_product_suite"),
    schemaFamily: text("schema_family"),
    schemaVersion: text("schema_version"),
    suiteIssueDatetimeUtc: timestamp("suite_issue_datetime_utc", {
      withTimezone: true,
    }),
    fullSuite: jsonb("full_suite").$type<Suite>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("product_suites_suite_id_idx").on(table.suiteId),
    index("product_suites_suite_issue_datetime_utc_idx").on(
      table.suiteIssueDatetimeUtc
    ),
  ]
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id").notNull(),
    productType: text("product_type").notNull(),
    suiteId: text("suite_id").notNull(),
    issueDatetimeUtc: timestamp("issue_datetime_utc", {
      withTimezone: true,
    }),
    metadata: jsonb("metadata").$type<ProductMetadata>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("products_product_id_idx").on(table.productId),
    index("products_suite_id_idx").on(table.suiteId),
    index("products_issue_datetime_utc_idx").on(table.issueDatetimeUtc),
  ]
);

// ---- Marine products (1:1 with products where product_type = 'marine_bulletin') ----
export const marineProducts = pgTable(
  "marine_products",
  {
    id: serial("id").primaryKey(),
    productRef: integer("product_ref")
      .notNull()
      .references(() => products.id),
    colorCode: text("color_code").notNull(),
    synopsisSummary: text("synopsis_summary").notNull(),
    elements: jsonb("elements").$type<ElementsBlock>().notNull(),
    coastalWaveNotesWest: text("coastal_wave_notes_west"),
    coastalWaveNotesEast: text("coastal_wave_notes_east"),
    responseSummaryText: text("response_summary_text"),
  },
  (table) => [
    uniqueIndex("marine_products_product_ref_idx").on(table.productRef),
    index("marine_products_color_code_idx").on(table.colorCode),
  ]
);

// ---- Morning products (1:1 with products where product_type = 'morning_forecast') ----
export const morningProducts = pgTable(
  "morning_products",
  {
    id: serial("id").primaryKey(),
    productRef: integer("product_ref")
      .notNull()
      .references(() => products.id),
    headline: text("headline").notNull(),
    elements: jsonb("elements").$type<ElementsBlock>().notNull(),
    productNotesAdvisories: jsonb("product_notes_advisories").$type<
      string[] | null
    >(),
  },
  (table) => [
    uniqueIndex("morning_products_product_ref_idx").on(table.productRef),
  ]
);

// ---- Midday products (1:1 with products where product_type = 'midday_weather_report') ----
export const middayProducts = pgTable(
  "midday_products",
  {
    id: serial("id").primaryKey(),
    productRef: integer("product_ref")
      .notNull()
      .references(() => products.id),
    stationName: text("station_name").notNull(),
    observationTimeLocal: text("observation_time_local").notNull(),
    airTemperatureC: numeric("air_temperature_c", {
      precision: 5,
      scale: 2,
    }).notNull(),
    headline: text("headline").notNull(),
    elements: jsonb("elements").$type<ElementsBlock>().notNull(),
    educationWordTerm: text("education_word_term"),
    educationWordDefinition: text("education_word_definition"),
  },
  (table) => [
    uniqueIndex("midday_products_product_ref_idx").on(table.productRef),
    index("midday_products_station_name_idx").on(table.stationName),
  ]
);

// ---- Evening products (1:1 with products where product_type = 'evening_forecast') ----
export const eveningProducts = pgTable(
  "evening_products",
  {
    id: serial("id").primaryKey(),
    productRef: integer("product_ref")
      .notNull()
      .references(() => products.id),
    headline: text("headline").notNull(),
    periodNightLabel: text("period_night_label").notNull(),
    periodNightValidityFrom: text("period_night_validity_from"),
    periodNightValidityTo: text("period_night_validity_to"),
    periodNightValidityText: text("period_night_validity_text"),
    periodNightElements: jsonb("period_night_elements")
      .$type<ElementsBlock>()
      .notNull(),
    periodDay1Label: text("period_day_1_label").notNull(),
    periodDay1DateLocal: text("period_day_1_date_local").notNull(),
    periodDay1Elements: jsonb("period_day_1_elements")
      .$type<ElementsBlock>()
      .notNull(),
    periodDay2Label: text("period_day_2_label").notNull(),
    periodDay2DateLocal: text("period_day_2_date_local").notNull(),
    periodDay2Elements: jsonb("period_day_2_elements")
      .$type<ElementsBlock>()
      .notNull(),
    periodDay3Label: text("period_day_3_label").notNull(),
    periodDay3DateLocal: text("period_day_3_date_local").notNull(),
    periodDay3Elements: jsonb("period_day_3_elements")
      .$type<ElementsBlock>()
      .notNull(),
  },
  (table) => [
    uniqueIndex("evening_products_product_ref_idx").on(table.productRef),
  ]
);

// ---- Tropical outlook products (1:1 with products where product_type = 'tropical_weather_outlook') ----
export const tropicalOutlookProducts = pgTable(
  "tropical_outlook_products",
  {
    id: serial("id").primaryKey(),
    productRef: integer("product_ref")
      .notNull()
      .references(() => products.id),
    areaDescription: text("area_description").notNull(),
    areaGeojson: jsonb("area_geojson"),
    sources: jsonb("sources").notNull(),
    systems: jsonb("systems").notNull(),
    nextUpdateTimeLocal: text("next_update_time_local"),
    publicMessagePlainLanguage: text("public_message_plain_language").notNull(),
  },
  (table) => [
    uniqueIndex("tropical_outlook_products_product_ref_idx").on(
      table.productRef
    ),
  ]
);

// ---- METAR/SPECI reports (1:1 with products where product_type = 'metar' | 'speci') ----
export const metarSpeciReports = pgTable(
  "metar_speci_reports",
  {
    id: serial("id").primaryKey(),
    productRef: integer("product_ref")
      .notNull()
      .references(() => products.id),
    reportType: text("report_type").notNull(), // 'METAR' | 'SPECI'
    aerodromeDesignator: text("aerodrome_designator").notNull(),
    issueTime: timestamp("issue_time", { withTimezone: true }).notNull(),
    observationTime: timestamp("observation_time", {
      withTimezone: true,
    }).notNull(),
    body: jsonb("body").$type<METARReport | SPECIReport>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("metar_speci_reports_product_ref_idx").on(table.productRef),
    index("metar_speci_reports_aerodrome_observation_idx").on(
      table.aerodromeDesignator,
      table.observationTime
    ),
  ]
);

// ---- TAF reports (1:1 with products where product_type = 'taf') ----
export const tafReports = pgTable(
  "taf_reports",
  {
    id: serial("id").primaryKey(),
    productRef: integer("product_ref")
      .notNull()
      .references(() => products.id),
    aerodromeDesignator: text("aerodrome_designator").notNull(),
    issueTime: timestamp("issue_time", { withTimezone: true }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    body: jsonb("body").$type<TAFReport>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("taf_reports_product_ref_idx").on(table.productRef),
    index("taf_reports_aerodrome_idx").on(table.aerodromeDesignator),
    index("taf_reports_validity_idx").on(table.validFrom, table.validUntil),
  ]
);

// ---- Relations ----
export const productsRelations = relations(products, ({ one }) => ({
  marineProduct: one(marineProducts),
  morningProduct: one(morningProducts),
  middayProduct: one(middayProducts),
  eveningProduct: one(eveningProducts),
  tropicalOutlookProduct: one(tropicalOutlookProducts),
  metarSpeciReport: one(metarSpeciReports),
  tafReport: one(tafReports),
}));

export const marineProductsRelations = relations(marineProducts, ({ one }) => ({
  product: one(products, {
    fields: [marineProducts.productRef],
    references: [products.id],
  }),
}));

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

export const tropicalOutlookProductsRelations = relations(
  tropicalOutlookProducts,
  ({ one }) => ({
    product: one(products, {
      fields: [tropicalOutlookProducts.productRef],
      references: [products.id],
    }),
  })
);

export const metarSpeciReportsRelations = relations(
  metarSpeciReports,
  ({ one }) => ({
    product: one(products, {
      fields: [metarSpeciReports.productRef],
      references: [products.id],
    }),
  })
);

export const tafReportsRelations = relations(tafReports, ({ one }) => ({
  product: one(products, {
    fields: [tafReports.productRef],
    references: [products.id],
  }),
}));

// ---- Inferred types ----
export type ProductSuite = typeof productSuites.$inferSelect;
export type ProductSuiteInsert = typeof productSuites.$inferInsert;
export type ProductRow = typeof products.$inferSelect;
export type ProductRowInsert = typeof products.$inferInsert;
export type MarineProductRow = typeof marineProducts.$inferSelect;
export type MarineProductRowInsert = typeof marineProducts.$inferInsert;
export type MorningProductRow = typeof morningProducts.$inferSelect;
export type MorningProductRowInsert = typeof morningProducts.$inferInsert;
export type MiddayProductRow = typeof middayProducts.$inferSelect;
export type MiddayProductRowInsert = typeof middayProducts.$inferInsert;
export type EveningProductRow = typeof eveningProducts.$inferSelect;
export type EveningProductRowInsert = typeof eveningProducts.$inferInsert;
export type TropicalOutlookProductRow =
  typeof tropicalOutlookProducts.$inferSelect;
export type TropicalOutlookProductRowInsert =
  typeof tropicalOutlookProducts.$inferInsert;
export type MetarSpeciReportRow = typeof metarSpeciReports.$inferSelect;
export type MetarSpeciReportRowInsert = typeof metarSpeciReports.$inferInsert;
export type TafReportRow = typeof tafReports.$inferSelect;
export type TafReportRowInsert = typeof tafReports.$inferInsert;
