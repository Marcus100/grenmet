import {
  legacyProductPreviewInputSchema,
  legacyProductPreviewSchema,
  legacyProductWriteSchema,
  legacyStoredProductSchema,
  outlookProductPreviewInputSchema,
  outlookProductPreviewSchema,
  outlookProductWriteSchema,
  outlookStoredProductSchema,
} from "@barrelsgd/api-client";
import { z } from "zod";

const legacyKindSchema = z.enum([
  "morning",
  "midday",
  "evening",
  "cyclone",
  "marine",
  "flood",
  "thunderstorm",
  "wind",
  "heat",
  "dust",
  "coastal",
  "tsunami",
]);

export const productWriteSchema = z.discriminatedUnion("kind", [
  outlookProductWriteSchema,
  legacyProductWriteSchema.extend({ kind: legacyKindSchema }),
]);

export const storedProductSchema = z.discriminatedUnion("kind", [
  outlookStoredProductSchema,
  legacyStoredProductSchema.extend({ kind: legacyKindSchema }),
]);

export const productPreviewInputSchema = z.discriminatedUnion("kind", [
  outlookProductPreviewInputSchema,
  legacyProductPreviewInputSchema.extend({ kind: legacyKindSchema }),
]);

export const productPreviewSchema = z.discriminatedUnion("kind", [
  outlookProductPreviewSchema,
  legacyProductPreviewSchema.extend({ kind: legacyKindSchema }),
]);
