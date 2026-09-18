import {
  type PublicForecast,
  type PublishedProduct,
  publicForecastSchema,
  publishedProductsSchema,
} from "@barrelsgd/api-client";
import type { ProductKind } from "@barrelsgd/gms/products";
import { cache } from "react";
import { env } from "@/lib/env";

export type ProductsResult =
  | { status: "ok"; products: PublishedProduct[] }
  | { status: "unavailable"; products: [] };

function endpoint(path: string) {
  const configured = env.AUTH_API_V1_STR.trim() || "/api/v1";
  const prefix = configured.startsWith("/") ? configured : `/${configured}`;
  const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return new URL(`${normalized}/wxproducts/public/${path}`, env.AUTH_API_URL);
}
const requestOptions = () => ({
  cache: "no-store" as const,
  credentials: "omit" as const,
  redirect: "error" as const,
  signal: AbortSignal.timeout(5000),
});

export const fetchPublishedProducts = cache(
  async function fetchPublishedProducts(
    kind?: ProductKind
  ): Promise<ProductsResult> {
    try {
      const url = endpoint("products");
      if (kind) url.searchParams.set("kind", kind);
      const response = await fetch(url, requestOptions());
      if (!response.ok) return { status: "unavailable", products: [] };
      const parsed = publishedProductsSchema.safeParse(await response.json());
      if (!parsed.success) return { status: "unavailable", products: [] };
      return { status: "ok", products: parsed.data.products };
    } catch {
      return { status: "unavailable", products: [] };
    }
  }
);

export const fetchPublicForecast = cache(
  async function fetchPublicForecast(): Promise<PublicForecast | null> {
    try {
      const response = await fetch(endpoint("forecast"), requestOptions());
      if (!response.ok) return null;
      const parsed = publicForecastSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
