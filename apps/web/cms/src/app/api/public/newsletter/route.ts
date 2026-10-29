import { getPayload } from "payload";
import { getEnv } from "../../../../env";
import { findNewsletterItems } from "../../../../lib/newsletter-feed";
import { NO_STORE } from "../../../../lib/public-feed";
import { reportError } from "../../../../lib/report-error";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

/**
 * The posts the daily newsletter digest reads: published posts ticked
 * "Include in newsletter" in the last few days. Anonymous, no staff fields.
 * Without the weather site's address the feed cannot link posts, so it says so
 * (the digest then carries no posts; its alerts still go out).
 */
export async function GET() {
  const origin = getEnv().GMS_SITE_URL;
  if (!origin)
    return Response.json(
      { error: "The weather site address is not configured" },
      { status: 503, headers: NO_STORE }
    );
  try {
    const payload = await getPayload({ config });
    const items = await findNewsletterItems(payload, {
      now: new Date(),
      origin,
    });
    return Response.json({ items }, { headers: NO_STORE });
  } catch (error) {
    reportError(error, "cms-public-newsletter");
    return Response.json(
      { error: "Content is unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
}
