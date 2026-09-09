import {
  isProductKind,
  localDateTime,
  productFields,
  validateProduct,
} from "@barrelsgd/gms/products";
import { z } from "zod";
export const productInputSchema = z.object({
  id: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  kind: z
    .string()
    .refine(isProductKind)
    .transform((v) => {
      if (!isProductKind(v)) throw new Error("Unknown product");
      return v;
    }),
  values: z.record(z.string().max(80), z.string().max(12_000)),
  action: z.enum(["draft", "publish", "withdraw"]),
  changeSummary: z.string().trim().max(1000),
  reviewed: z.boolean(),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export function validateProductInput(
  input: ProductInput,
  now = Date.now()
): string[] {
  if (
    Object.keys(input.values).some(
      (key) => !productFields(input.kind).some((f) => f.key === key)
    )
  )
    return ["Unknown product field"];
  if (input.action === "withdraw")
    return input.changeSummary
      ? []
      : ["Explain why this product is being withdrawn"];
  const errors = validateProduct(input, input.action === "publish");
  if (input.action === "publish") {
    if (
      Object.values(input.values).some((value) =>
        value.toLowerCase().includes("example")
      )
    )
      errors.push("Replace example draft wording before publishing");
    if (!input.reviewed) errors.push("Review the preview before publishing");
    if (localDateTime(input.values.validTo) <= now)
      errors.push("An expired product cannot be published");
    if (localDateTime(input.values.issuedAt) > now)
      errors.push("Issue time cannot be in the future");
    if (input.expectedRevision > 0 && !input.changeSummary)
      errors.push("Describe this issue or revision");
  }
  return errors;
}
