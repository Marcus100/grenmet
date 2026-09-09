import {
  isCurrentProduct,
  isProductKind,
  type ProductKind,
  type PublishedProduct,
  validateProduct,
} from "@barrelsgd/gms/products";
import { z } from "zod";
import { env } from "@/lib/env";

const publicProductSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  kind: z
    .string()
    .refine(isProductKind)
    .transform((value) => {
      if (!isProductKind(value)) throw new Error("Unknown product");
      return value;
    }),
  values: z.record(z.string(), z.string()),
});
export type ProductsResult =
  | { status: "ok"; products: PublishedProduct[] }
  | { status: "unavailable"; products: [] };
export async function fetchPublishedProducts(
  kind?: ProductKind
): Promise<ProductsResult> {
  if (!env.WXPRODUCTS_API_URL) return { status: "unavailable", products: [] };
  try {
    const url = new URL("/api/public/products", env.WXPRODUCTS_API_URL);
    if (kind) url.searchParams.set("kind", kind);
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { status: "unavailable", products: [] };
    const parsed = z
      .object({ products: z.array(publicProductSchema) })
      .safeParse(await response.json());
    if (
      !parsed.success ||
      parsed.data.products.some((p) => validateProduct(p, true).length > 0)
    )
      return { status: "unavailable", products: [] };
    return {
      status: "ok",
      products: parsed.data.products.filter(
        (p) => (!kind || p.kind === kind) && isCurrentProduct(p)
      ),
    };
  } catch {
    return { status: "unavailable", products: [] };
  }
}
