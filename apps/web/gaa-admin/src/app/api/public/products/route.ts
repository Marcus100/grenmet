import { isProductKind } from "@barrelsgd/gms/products";
import { NextResponse } from "next/server";
import { listPublishedProducts } from "@/db/wxproducts/authored-queries";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind && !isProductKind(kind))
    return NextResponse.json(
      { error: "Unknown product type" },
      { status: 400 }
    );
  try {
    const products = await listPublishedProducts(
      kind && isProductKind(kind) ? kind : undefined
    );
    return NextResponse.json(
      { products },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Product information is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
