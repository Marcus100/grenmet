// Browser HTTP adapters. FastAPI owns sessions, authorization and product rules.
import {
  authoredProductsSchema,
  browserSessionSchema,
  productHistorySchema,
  productPreviewInputSchema,
  productPreviewSchema,
  productRevisionPdfApiV1WxproductsProductsProductIdRevisionsRevisionPdfGetPathProductIdSchema,
  productRevisionPdfApiV1WxproductsProductsProductIdRevisionsRevisionPdfGetPathRevisionSchema,
  storedProductSchema,
} from "@barrelsgd/api-client";
import { isProductKind } from "@barrelsgd/gms/products";
import { z } from "zod";
import { productInputSchema } from "@/lib/wxproducts/product-input";

class ProductApiError extends Error {}
export async function downloadProductPdfAction(id: string, revision: number) {
  try {
    productRevisionPdfApiV1WxproductsProductsProductIdRevisionsRevisionPdfGetPathProductIdSchema.parse(
      id
    );
    productRevisionPdfApiV1WxproductsProductsProductIdRevisionsRevisionPdfGetPathRevisionSchema
      .positive()
      .parse(revision);
    const response = await fetch(
      `/_backend/weather/products/${id}/revisions/${revision}/pdf`,
      {
        credentials: "same-origin",
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
        redirect: "error",
      }
    );
    if (
      !(
        response.ok &&
        response.headers.get("content-type")?.startsWith("application/pdf")
      )
    )
      throw new Error("PDF unavailable");
    const blob = await response.blob();
    return { ok: true as const, blob };
  } catch {
    return {
      ok: false as const,
      error:
        "Could not download this saved revision. Check your session and connection.",
    };
  }
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const detail = z.object({ detail: z.string() }).safeParse(body);
    throw new ProductApiError(
      [400, 403, 409, 422].includes(response.status) && detail.success
        ? detail.data.detail
        : "Check your session and connection, then try again."
    );
  }
  return body;
}
export async function saveProductAction(raw: unknown) {
  try {
    const input = productInputSchema.safeParse(raw);
    if (!input.success)
      return {
        ok: false as const,
        error: "Check the product fields and try again.",
      };
    // Obtain a fresh token per mutation so account changes and session rotation cannot reuse a cached token.
    const session = browserSessionSchema.parse(
      await request("/_backend/browser-session")
    );
    const product = storedProductSchema.parse(
      await request("/_backend/weather/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify(input.data),
      })
    );
    return { ok: true as const, product };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof ProductApiError
          ? error.message
          : "Could not save. Check your session and connection, then try again.",
    };
  }
}
export async function loadProductsAction(kind: string, issueDate: string) {
  try {
    if (!isProductKind(kind))
      return { ok: false as const, error: "Unknown product type" };
    if (!z.string().date().safeParse(issueDate).success)
      return { ok: false as const, error: "Select a valid issue date" };
    const query = new URLSearchParams({ kind, issue_date: issueDate });
    const { products } = authoredProductsSchema.parse(
      await request(`/_backend/weather/products?${query}`)
    );
    return { ok: true as const, products };
  } catch {
    return {
      ok: false as const,
      error: "Could not load saved products. Try again.",
    };
  }
}
export async function loadProductHistoryAction(id: string) {
  try {
    if (!z.string().uuid().safeParse(id).success)
      return { ok: false as const, error: "Invalid product" };
    const { history } = productHistorySchema.parse(
      await request(`/_backend/weather/products/${id}/history`)
    );
    return { ok: true as const, history };
  } catch {
    return { ok: false as const, error: "Could not load revision history." };
  }
}

export async function previewProductAction(raw: unknown) {
  try {
    const input = productPreviewInputSchema.parse(raw);
    const session = browserSessionSchema.parse(
      await request("/_backend/browser-session")
    );
    const preview = productPreviewSchema.parse(
      await request("/_backend/weather/products/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify(input),
      })
    );
    return { ok: true as const, preview };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof ProductApiError
          ? error.message
          : "Could not validate. Check your session and connection, then try again.",
    };
  }
}
