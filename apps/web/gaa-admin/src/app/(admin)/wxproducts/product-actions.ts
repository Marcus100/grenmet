"use server";

import { isProductKind } from "@barrelsgd/gms/products";
import { z } from "zod";
import {
  getProductHistory,
  listAuthoredProducts,
  RevisionConflict,
  writeAuthoredProduct,
} from "@/db/wxproducts/authored-queries";
import {
  authApiFetch,
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";
import {
  productInputSchema,
  validateProductInput,
} from "@/lib/wxproducts/product-input";

class ProductAccessError extends Error {}
async function requireAuthor(kind?: string) {
  const token = await readSessionCookie();
  if (!token) throw new Error("Sign in again to manage products");
  const { user } = await exchangeSessionForAccessToken(token);
  if (!user.is_active) throw new Error("An active staff account is required");
  const access = await authApiFetch<{ allowed_kinds: string[] }>(
    "/hr/product-access/me",
    { cache: "no-store" }
  );
  if (
    kind
      ? !access.allowed_kinds.includes(kind)
      : access.allowed_kinds.length === 0
  )
    throw new ProductAccessError(
      "Your account is not authorized to author GMS products."
    );
  return {
    actor: { id: user.id, name: user.full_name || user.email },
    allowedKinds: access.allowed_kinds.filter(isProductKind),
  };
}
export async function saveProductAction(raw: unknown) {
  try {
    const input = productInputSchema.safeParse(raw);
    if (!input.success)
      return {
        ok: false as const,
        error: "Check the product fields and try again.",
      };
    const { actor } = await requireAuthor(input.data.kind);
    const errors = validateProductInput(input.data);
    if (errors.length) return { ok: false as const, error: errors.join("\n") };
    const product = await writeAuthoredProduct(input.data, actor);
    return { ok: true as const, product };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof RevisionConflict || error instanceof ProductAccessError
          ? error.message
          : "Could not save. Check your session and connection, then try again.",
    };
  }
}
export async function loadProductsAction(kind: string, issueDate: string) {
  try {
    await requireAuthor(kind);
    if (!z.string().date().safeParse(issueDate).success)
      return { ok: false as const, error: "Select a valid issue date" };
    if (!isProductKind(kind))
      return { ok: false as const, error: "Unknown product type" };
    return {
      ok: true as const,
      products: await listAuthoredProducts(kind, issueDate),
    };
  } catch {
    return {
      ok: false as const,
      error: "Could not load saved products. Try again.",
    };
  }
}
export async function loadProductHistoryAction(id: string) {
  try {
    const { allowedKinds } = await requireAuthor();
    if (!z.string().uuid().safeParse(id).success)
      return { ok: false as const, error: "Invalid product" };
    const history = await getProductHistory(id, allowedKinds);
    return {
      ok: true as const,
      history: history.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  } catch {
    return { ok: false as const, error: "Could not load revision history." };
  }
}
