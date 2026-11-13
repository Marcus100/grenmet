import { proxyProductPdf } from "@/lib/products";

export const dynamic = "force-dynamic";

/** The issued product's PDF, served from this site (proxy to FastAPI). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyProductPdf(id);
}
