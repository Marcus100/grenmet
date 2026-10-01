import {
  createClient,
  type PublicPublishedProduct,
  wxproductsListPublicProducts,
} from "@barrelsgd/api-client";
import type { PayloadHandler } from "payload";
import { getEnv } from "../env";

/** One choice in the linked-product picker: never the product's figures. */
export interface LinkedProductOption {
  id: string;
  kind: string;
  label: string;
}

const kindLabel = (kind: string) =>
  kind.charAt(0).toUpperCase() + kind.slice(1).replaceAll("-", " ");

/** "Marine · issued 2026-09-30 05:00", from the snapshot's own fields. */
export function toOption(product: PublicPublishedProduct): LinkedProductOption {
  const issued = product.values.issuedAt?.replace("T", " ");
  return {
    id: product.id,
    kind: product.kind,
    label: issued
      ? `${kindLabel(product.kind)} · issued ${issued}`
      : kindLabel(product.kind),
  };
}

/** Products currently published in FastAPI, for editors to link a post to. */
export async function listLinkedProductOptions(
  baseURL: string
): Promise<LinkedProductOption[]> {
  const client = createClient({ options: { cache: "no-store" }, baseURL });
  const { products } = await wxproductsListPublicProducts({
    client,
    signal: AbortSignal.timeout(5000),
  }).unwrap();
  return products.map(toOption);
}

/**
 * `GET /api/linked-products`: staff only. The picker reads FastAPI through
 * the CMS so the browser needs no FastAPI origin or CORS rule.
 */
export const linkedProductsEndpoint: PayloadHandler = async (req) => {
  if (!req.user) return Response.json({ error: "Sign in" }, { status: 401 });
  try {
    const products = await listLinkedProductOptions(getEnv().AUTH_API_URL);
    return Response.json(
      { products },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // Lazy: the config also loads outside Next.js (migrations, type generation).
    const { reportError } = await import("./report-error");
    reportError(error, "cms-linked-products");
    return Response.json(
      { error: "Weather products are unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
};
