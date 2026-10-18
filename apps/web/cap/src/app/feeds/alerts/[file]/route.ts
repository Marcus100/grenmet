import { proxyFeed } from "@/lib/feed-proxy";

/** `/feeds/alerts/<identifier>.xml`: the CAP 1.2 document for one alert. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!file.endsWith(".xml")) {
    return new Response("Not found", { status: 404 });
  }
  const identifier = file.slice(0, -".xml".length);
  return proxyFeed(
    `/api/cap/${encodeURIComponent(safeDecode(identifier))}.xml`,
    "application/xml; charset=utf-8"
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
