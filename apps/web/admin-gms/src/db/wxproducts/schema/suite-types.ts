/**
 * GMS Daily Product Suite — metadata, catalog, and authored forecast products.
 *
 * IBF assessments and CAP alerts are no longer embedded here; they live in
 * dedicated DB tables (ibf_assessments, cap_alerts, cap_bundles) and are
 * linked via FK to products.product_id.
 */

import { z } from "zod";
import type { EveningForecast } from "@/db/wxproducts/schema/evening";
import { eveningForecastSchema } from "@/db/wxproducts/schema/evening";
import type { MarineForecast } from "@/db/wxproducts/schema/marine";
import { marineForecastSchema } from "@/db/wxproducts/schema/marine";
import type { MiddayForecast } from "@/db/wxproducts/schema/midday";
import { middayForecastSchema } from "@/db/wxproducts/schema/midday";
import type { MorningForecast } from "@/db/wxproducts/schema/morning";
import { morningForecastSchema } from "@/db/wxproducts/schema/morning";
import type { TropicalOutlookForecast } from "@/db/wxproducts/schema/outlook";
import { tropicalOutlookForecastSchema } from "@/db/wxproducts/schema/outlook";
import type { ProductType } from "@/db/wxproducts/schema/primitives";
import type { Product } from "@/db/wxproducts/schema/product-metadata";
import { productSchema } from "@/db/wxproducts/schema/product-metadata";
import { productTypeSchema } from "@/db/wxproducts/schema/zod-primitives";

export interface Suite {
  catalog: {
    product_types_supported: Array<{
      cap_schema: string;
      ibf_schema: string;
      payload_schema: string;
      product_type: ProductType;
    }>;
    shared_elements_standard: {
      elements_block: string[];
      units: Record<string, string[] | string>;
    };
  };

  products: Array<
    | Product<EveningForecast>
    | Product<MarineForecast>
    | Product<MiddayForecast>
    | Product<MorningForecast>
    | Product<TropicalOutlookForecast>
  >;

  suite_metadata: {
    best_practice_flags: {
      cap_generated_for_warnings_advisories_only: boolean;
      ibf_required_for_all_products: boolean;
      icao_alignment_intent: boolean;
      wmo_alignment_intent: boolean;
    };
    geography: {
      area_name: string;
      granularity: "national_only" | "zones" | "geojson";
    };
    issuing_agency: {
      contacts: {
        email: string;
        fax?: string | null;
        telephone: string;
        telephone_alt?: string | null;
        website?: string | null;
      };
      country: string;
      department: string;
      iso3: string;
      name: string;
      timezone: string;
    };
    schema_family: string;
    schema_version: string;
    suite_id: string;
    suite_issue_datetime_local: string;
    suite_issue_datetime_utc: string;
    suite_type: "daily_product_suite";
    update_policy: {
      next_update_time_local: string;
      next_update_time_utc: string;
      notes?: string | null;
    };
  };
}

const productUnionSchema = z.union([
  productSchema(marineForecastSchema),
  productSchema(morningForecastSchema),
  productSchema(middayForecastSchema),
  productSchema(eveningForecastSchema),
  productSchema(tropicalOutlookForecastSchema),
]);

export const suiteSchema = z.object({
  suite_metadata: z.object({
    suite_id: z.string(),
    suite_type: z.literal("daily_product_suite"),
    schema_family: z.string(),
    schema_version: z.string(),
    issuing_agency: z.object({
      name: z.string(),
      department: z.string(),
      country: z.string(),
      iso3: z.string(),
      timezone: z.string(),
      contacts: z.object({
        email: z.string(),
        telephone: z.string(),
        telephone_alt: z.string().nullable().optional(),
        fax: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
      }),
    }),
    suite_issue_datetime_local: z.string(),
    suite_issue_datetime_utc: z.string(),
    geography: z.object({
      area_name: z.string(),
      granularity: z.enum(["national_only", "zones", "geojson"]),
    }),
    update_policy: z.object({
      next_update_time_local: z.string(),
      next_update_time_utc: z.string(),
      notes: z.string().nullable().optional(),
    }),
    best_practice_flags: z.object({
      wmo_alignment_intent: z.boolean(),
      icao_alignment_intent: z.boolean(),
      ibf_required_for_all_products: z.boolean(),
      cap_generated_for_warnings_advisories_only: z.boolean(),
    }),
  }),
  catalog: z.object({
    product_types_supported: z.array(
      z.object({
        product_type: productTypeSchema,
        payload_schema: z.string(),
        ibf_schema: z.string(),
        cap_schema: z.string(),
      })
    ),
    shared_elements_standard: z.object({
      elements_block: z.array(z.string()),
      units: z.record(z.string(), z.union([z.array(z.string()), z.string()])),
    }),
  }),
  products: z.array(productUnionSchema),
});
