/**
 * Product metadata, links, and generic Product wrapper.
 */

import type {
  ISODateTimeString,
  ProductType,
} from "@/db/wxproducts/schema/primitives";

export type ProductStatus = "operational" | "test" | "training" | "archived";

export interface Validity {
  valid_duration_hours: number;
  valid_from_local: ISODateTimeString;
  valid_to_local: ISODateTimeString;
  validity_text?: string | null;
}

export interface Versioning {
  change_summary: string | null;
  is_correction: boolean;
  replaces_product_id: string | null;
  revision: number;
  version: number;
}

export interface Geography {
  area_name: string;
  granularity?: "national_only" | "zones" | "geojson";
}

export interface ProductLinks {
  cap_bundle_id: string | null;
  ibf_assessment_id: string | null;
  related_product_ids?: string[];
}

export interface ProductMetadata {
  forecaster: { name: string; role?: string | null };
  geography: Geography;
  issue_datetime_local: ISODateTimeString;
  issue_datetime_utc: ISODateTimeString;
  language: string;
  product_channel: Array<"website" | "social_media" | "email" | "api">;
  product_id: string;
  product_type: ProductType;
  status: ProductStatus;
  validity: Validity;
  versioning: Versioning;
}

export interface Product<TForecast = unknown> {
  forecast: TForecast;
  links: ProductLinks;
  product_metadata: ProductMetadata;
}

// Zod schemas for runtime validation
import { z } from "zod";
import {
  isoDateTimeStringSchema,
  productTypeSchema,
} from "@/db/wxproducts/schema/primitives.schema";

export const productStatusSchema = z.enum([
  "operational",
  "test",
  "training",
  "archived",
]);

export const validitySchema = z.object({
  valid_from_local: isoDateTimeStringSchema,
  valid_to_local: isoDateTimeStringSchema,
  valid_duration_hours: z.number(),
  validity_text: z.string().nullable().optional(),
});

export const versioningSchema = z.object({
  version: z.number(),
  revision: z.number(),
  is_correction: z.boolean(),
  replaces_product_id: z.string().nullable(),
  change_summary: z.string().nullable(),
});

export const geographySchema = z.object({
  area_name: z.string(),
  granularity: z.enum(["national_only", "zones", "geojson"]).optional(),
});

export const productLinksSchema = z.object({
  ibf_assessment_id: z.string().nullable(),
  cap_bundle_id: z.string().nullable(),
  related_product_ids: z.array(z.string()).optional(),
});

export const productMetadataSchema = z.object({
  product_id: z.string(),
  product_type: productTypeSchema,
  issue_datetime_local: isoDateTimeStringSchema,
  issue_datetime_utc: isoDateTimeStringSchema,
  validity: validitySchema,
  status: productStatusSchema,
  language: z.string(),
  versioning: versioningSchema,
  geography: geographySchema,
  product_channel: z.array(z.enum(["website", "social_media", "email", "api"])),
  forecaster: z.object({
    name: z.string(),
    role: z.string().nullable().optional(),
  }),
});

export function productSchema<T extends z.ZodType>(forecastSchema: T) {
  return z.object({
    forecast: forecastSchema,
    links: productLinksSchema,
    product_metadata: productMetadataSchema,
  });
}
