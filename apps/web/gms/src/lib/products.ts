import {
  type PublicCurrentConditions,
  type PublicForecast,
  type PublicProductDetail,
  type PublicPublishedProduct,
  publicCurrentConditionsSchema,
  publicForecastSchema,
  publicProductDetailSchema,
  publishedProductsSchema,
} from "@barrelsgd/api-client";
import type { ProductKind } from "@barrelsgd/gms/products";
import { cache } from "react";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

export type ProductsResult =
  | { status: "ok"; products: PublicPublishedProduct[] }
  | { status: "unavailable"; products: [] };

function endpoint(path: string, domain = "wxproducts") {
  const configured = env.AUTH_API_V1_STR.trim() || "/api/v1";
  const prefix = configured.startsWith("/") ? configured : `/${configured}`;
  const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return new URL(`${normalized}/${domain}/public/${path}`, env.AUTH_API_URL);
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
      if (!parsed.success) {
        reportError(parsed.error, "gms-products-contract");
        return { status: "unavailable", products: [] };
      }
      return { status: "ok", products: parsed.data.products };
    } catch (error) {
      reportError(error, "gms-products");
      return { status: "unavailable", products: [] };
    }
  }
);

export type ProductResult =
  | { status: "ok"; product: PublicProductDetail }
  | { status: "not-found" }
  | { status: "unavailable" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One published product by id, for pages and editorial links. Stays readable
 * after it expires (`current` false); withdrawn or unknown ids are not found.
 */
export const fetchPublishedProduct = cache(async function fetchPublishedProduct(
  id: string
): Promise<ProductResult> {
  if (!UUID.test(id)) return { status: "not-found" };
  try {
    const response = await fetch(
      endpoint(`products/${encodeURIComponent(id)}`),
      requestOptions()
    );
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "unavailable" };
    const parsed = publicProductDetailSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-product-contract");
      return { status: "unavailable" };
    }
    return { status: "ok", product: parsed.data };
  } catch (error) {
    reportError(error, "gms-product");
    return { status: "unavailable" };
  }
});

export const fetchPublicForecast = cache(
  async function fetchPublicForecast(): Promise<PublicForecast | null> {
    try {
      const response = await fetch(endpoint("forecast"), requestOptions());
      if (!response.ok) return null;
      const parsed = publicForecastSchema.safeParse(await response.json());
      if (!parsed.success) {
        reportError(parsed.error, "gms-forecast-contract");
        return null;
      }
      return parsed.data;
    } catch (error) {
      reportError(error, "gms-forecast");
      return null;
    }
  }
);

/** Latest MBIA reading from the observation register; null on any failure. */
export const fetchCurrentConditions = cache(
  async function fetchCurrentConditions(): Promise<PublicCurrentConditions | null> {
    try {
      const response = await fetch(
        endpoint("current", "eregister"),
        requestOptions()
      );
      if (!response.ok) return null;
      const parsed = publicCurrentConditionsSchema.safeParse(
        await response.json()
      );
      if (!parsed.success) {
        reportError(parsed.error, "gms-current-contract");
        return null;
      }
      return parsed.data;
    } catch (error) {
      reportError(error, "gms-current");
      return null;
    }
  }
);
