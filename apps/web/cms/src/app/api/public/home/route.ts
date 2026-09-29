import { getPayload } from "payload";
import { findArticles, NO_STORE } from "../../../../lib/public-feed";
import { reportError } from "../../../../lib/report-error";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

type Part<T> = { status: "ok"; items: T } | { status: "unavailable" };

async function part<T>(area: string, load: () => Promise<T>): Promise<Part<T>> {
  try {
    return { status: "ok", items: await load() };
  } catch (error) {
    reportError(error, `cms-public-home-${area}`);
    return { status: "unavailable" };
  }
}

/**
 * Everything the GMS homepage reads from the CMS in one anonymous call. Each
 * part fails on its own, so one broken section never hides the others.
 */
export async function GET() {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  try {
    payload = await getPayload({ config });
  } catch (error) {
    reportError(error, "cms-public-home");
    return Response.json(
      { error: "Content is unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
  const [deskUpdates, stories, publications] = await Promise.all([
    part("desk-updates", () =>
      findArticles(payload, "desk-updates", { limit: 5 })
    ),
    part("stories", () => findArticles(payload, "stories", { limit: 5 })),
    part("publications", () =>
      findArticles(payload, "publications", { limit: 6 })
    ),
  ]);
  return Response.json(
    { deskUpdates, stories, publications },
    { headers: NO_STORE }
  );
}
