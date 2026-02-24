/**
 * GMS Daily Product Suite type: metadata, catalog, cross_cutting (IBF/CAP), and products.
 */

import type { CAPBundle } from "@/app/schema/cap";
import type { EveningPayload } from "@/app/schema/evening";
import type {
  IBFAssessment,
  ImpactSeverity,
  LikelihoodLevel,
  ResponseLevel,
  Sector,
} from "@/app/schema/ibf";
import type { MarinePayload } from "@/app/schema/marine";
import type { MiddayPayload } from "@/app/schema/midday";
import type { MorningPayload } from "@/app/schema/morning";
import type { TropicalOutlookPayload } from "@/app/schema/outlook";
import type { ProductType } from "@/app/schema/primitives";
import type { Product } from "@/app/schema/product-metadata";

export interface Suite {
  catalog: {
    product_types_supported: Array<{
      product_type: ProductType;
      payload_schema: string;
      ibf_schema: string;
      cap_schema: string;
    }>;
    shared_elements_standard: {
      elements_block: string[];
      units: Record<string, string[] | string>;
    };
  };

  cross_cutting: {
    ibf: {
      ibf_framework: {
        name: string;
        version: string;
        required_components_for_all_products: string[];
        scales: {
          likelihood_levels: LikelihoodLevel[];
          impact_severity_levels: ImpactSeverity[];
          response_levels: ResponseLevel[];
        };
        sectors: Sector[];
      };
      assessments: IBFAssessment[];
    };

    cap: {
      cap_generation_policy: {
        generate_for: Array<"warning" | "watch" | "advisory">;
        do_not_generate_for: string[];
        relationship_to_ibf: string;
      };
      alert_bundles: CAPBundle[];
    };
  };

  products: Array<
    | Product<MarinePayload>
    | Product<MorningPayload>
    | Product<MiddayPayload>
    | Product<EveningPayload>
    | Product<TropicalOutlookPayload>
  >;
  suite_metadata: {
    suite_id: string;
    suite_type: "daily_product_suite";
    schema_family: string;
    schema_version: string;
    issuing_agency: {
      name: string;
      department: string;
      country: string;
      iso3: string;
      timezone: string;
      contacts: {
        email: string;
        telephone: string;
        telephone_alt?: string | null;
        fax?: string | null;
        website?: string | null;
      };
    };
    suite_issue_datetime_local: string;
    suite_issue_datetime_utc: string;
    geography: {
      area_name: string;
      granularity: "national_only" | "zones" | "geojson";
    };
    update_policy: {
      next_update_time_local: string;
      next_update_time_utc: string;
      notes?: string | null;
    };
    best_practice_flags: {
      wmo_alignment_intent: boolean;
      icao_alignment_intent: boolean;
      ibf_required_for_all_products: boolean;
      cap_generated_for_warnings_advisories_only: boolean;
    };
  };
}

import { z } from "zod";
import { capBundleSchema } from "@/app/schema/cap";
import { eveningPayloadSchema } from "@/app/schema/evening";
import { ibfAssessmentSchema } from "@/app/schema/ibf";
import { marinePayloadSchema } from "@/app/schema/marine";
import { middayPayloadSchema } from "@/app/schema/midday";
import { morningPayloadSchema } from "@/app/schema/morning";
import { tropicalOutlookPayloadSchema } from "@/app/schema/outlook";
import { productSchema } from "@/app/schema/product-metadata";
import { productTypeSchema } from "@/app/schema/zod-primitives";

const productUnionSchema = z.union([
  productSchema(marinePayloadSchema),
  productSchema(morningPayloadSchema),
  productSchema(middayPayloadSchema),
  productSchema(eveningPayloadSchema),
  productSchema(tropicalOutlookPayloadSchema),
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
  cross_cutting: z.object({
    ibf: z.object({
      ibf_framework: z.object({
        name: z.string(),
        version: z.string(),
        required_components_for_all_products: z.array(z.string()),
        scales: z.object({
          likelihood_levels: z.array(z.string()),
          impact_severity_levels: z.array(z.string()),
          response_levels: z.array(z.string()),
        }),
        sectors: z.array(z.string()),
      }),
      assessments: z.array(ibfAssessmentSchema),
    }),
    cap: z.object({
      cap_generation_policy: z.object({
        generate_for: z.array(z.enum(["warning", "watch", "advisory"])),
        do_not_generate_for: z.array(z.string()),
        relationship_to_ibf: z.string(),
      }),
      alert_bundles: z.array(capBundleSchema),
    }),
  }),
  products: z.array(productUnionSchema),
});
