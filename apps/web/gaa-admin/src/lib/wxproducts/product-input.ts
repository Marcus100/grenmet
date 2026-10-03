import type { z } from "zod";
import { productWriteSchema } from "./api-schemas";

// Transport shape only. FastAPI owns normalization and publication rules.
export const productInputSchema = productWriteSchema;
export type ProductInput = z.infer<typeof productInputSchema>;
