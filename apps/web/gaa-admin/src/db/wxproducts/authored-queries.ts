import "server-only";
import {
  type PublishedProduct,
  publishedProductsSchema,
} from "@barrelsgd/api-client";
import type { ProductKind } from "@barrelsgd/gms/products";
import { getAuthApiBaseUrl, getAuthApiPrefix } from "@/lib/auth-config";

/** Compatibility entrypoint for the dashboard; FastAPI owns product storage. */
export async function listPublishedProducts(
  kind?: ProductKind
): Promise<PublishedProduct[]> {
  const url = new URL(
    `${getAuthApiPrefix()}/wxproducts/public/products`,
    getAuthApiBaseUrl()
  );
  if (kind) url.searchParams.set("kind", kind);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Weather products unavailable");
  const body = publishedProductsSchema.parse(await response.json());
  return body.products;
}
