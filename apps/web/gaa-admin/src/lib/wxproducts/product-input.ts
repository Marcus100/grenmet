import { productWriteSchema } from "@barrelsgd/api-client";
import type { z } from "zod";

// Transport shape only. FastAPI owns normalization and publication rules.
export const productInputSchema = productWriteSchema.strip();
export type ProductInput = z.infer<typeof productInputSchema>;
