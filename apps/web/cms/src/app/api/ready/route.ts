import { getPayload } from "payload";
import config from "../../../payload.config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getPayload({ config });
    await payload.find({
      collection: "content",
      limit: 1,
      depth: 0,
      overrideAccess: false,
    });
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
