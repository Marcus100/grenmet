// Browser HTTP adapters. FastAPI owns sessions, authorization and product rules.
import {
  authoredProductsSchema,
  browserSessionSchema,
  productHistorySchema,
  wxproductsProductRevisionPdfPathProductIdSchema,
  wxproductsProductRevisionPdfPathRevisionSchema,
} from "@barrelsgd/api-client";
import type { ProductValues, StoredProduct } from "@barrelsgd/gms/products";
import { isProductKind } from "@barrelsgd/gms/products";
import { z } from "zod";
import { reportError } from "@/lib/report-error";
import {
  productPreviewInputSchema,
  productPreviewSchema,
  storedProductSchema,
} from "@/lib/wxproducts/api-schemas";
import { productInputSchema } from "@/lib/wxproducts/product-input";

class ProductApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function toUiValues(
  values: Record<string, string | null | undefined>
): ProductValues {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value ?? ""])
  );
}

function toUiStoredProduct(
  product: z.infer<typeof storedProductSchema>
): StoredProduct {
  return { ...product, values: toUiValues(product.values) };
}
export async function downloadProductPdfAction(id: string, revision: number) {
  try {
    wxproductsProductRevisionPdfPathProductIdSchema.parse(id);
    wxproductsProductRevisionPdfPathRevisionSchema.positive().parse(revision);
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
  } catch (error) {
    reportError(error, "wxproducts");
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
        : "Check your session and connection, then try again.",
      response.status
    );
  }
  return body;
}
function withoutActorIdentity(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const { actorId: _actorId, ...input } = raw as Record<string, unknown>;
  return input;
}

export async function saveProductAction(raw: unknown) {
  try {
    const input = productInputSchema.safeParse(withoutActorIdentity(raw));
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
    return { ok: true as const, product: toUiStoredProduct(product) };
  } catch (error) {
    reportError(error, "wxproducts");
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
    return { ok: true as const, products: products.map(toUiStoredProduct) };
  } catch (error) {
    reportError(error, "wxproducts");
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
  } catch (error) {
    reportError(error, "wxproducts");
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
    return {
      ok: true as const,
      preview: { ...preview, values: toUiValues(preview.values) },
    };
  } catch (error) {
    reportError(error, "wxproducts");
    return {
      ok: false as const,
      error:
        error instanceof ProductApiError
          ? error.message
          : "Could not validate. Check your session and connection, then try again.",
    };
  }
}
