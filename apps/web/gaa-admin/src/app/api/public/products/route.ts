import { isProductKind } from "@barrelsgd/gms/products";
import { NextResponse } from "next/server";
import { getAuthApiBaseUrl, getAuthApiPrefix } from "@/lib/auth-config";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind && !isProductKind(kind))
    return NextResponse.json(
      { error: "Unknown product type" },
      { status: 400 }
    );
  try {
    const url = new URL(
      `${getAuthApiPrefix()}/wxproducts/public/products`,
      getAuthApiBaseUrl()
    );
    if (kind) url.searchParams.set("kind", kind);
    const upstream = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) throw new Error("Weather product feed unavailable");
    const body: unknown = await upstream.json();
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Product information is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
