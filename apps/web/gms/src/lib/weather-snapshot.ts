import { cache } from "react";
import { env } from "@/lib/env";
import { REFERENCE_WEATHER, weatherFromProducts } from "@/lib/forecast-data";
import { fetchPublishedProducts } from "@/lib/products";
export const getWeatherSnapshot = cache(async () => {
  if (!env.WXPRODUCTS_API_URL) return REFERENCE_WEATHER;
  const result = await fetchPublishedProducts();
  const snapshot = weatherFromProducts(result.products);
  if (result.status === "unavailable")
    snapshot.label =
      "Weather product information cannot be retrieved right now.";
  return snapshot;
});
