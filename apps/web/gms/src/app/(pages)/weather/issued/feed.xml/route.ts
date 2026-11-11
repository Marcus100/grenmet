import { env } from "@/lib/env";
import { issuedFeedXml } from "@/lib/issued-feed";
import { fetchIssuedProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

/** RSS of issued products (#1197): renders FastAPI's list, no logic of its own. */
export async function GET() {
  const result = await fetchIssuedProducts();
  if (result.status !== "ok")
    return new Response("Issued products feed unavailable", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  return new Response(
    issuedFeedXml(result.products, env.NEXT_PUBLIC_SITE_URL),
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
