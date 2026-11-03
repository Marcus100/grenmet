import { chosenOrganiser } from "@/data/organiser-choice";
import { env } from "@/env";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";

const LISTING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Settlement CSV download. Only proxies the API's export with the member's
 * token; the report and the access check live in FastAPI.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!LISTING_ID.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  const session = await getSession();
  if (!session) {
    return new Response("Sign in to download", { status: 401 });
  }
  const organiser = await chosenOrganiser();
  const query = organiser ? `?organiser=${encodeURIComponent(organiser)}` : "";
  try {
    const upstream = await fetch(
      `${env.AUTH_API_URL}${env.AUTH_API_V1_STR}/events/manage/${id}/settlement.csv${query}`,
      { headers: { authorization: `Bearer ${session.accessToken}` } }
    );
    if (!upstream.ok) {
      return new Response("Not available", { status: upstream.status });
    }
    return new Response(await upstream.text(), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="settlement-${id}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    reportError(error, "events-settlement-csv");
    return new Response("Unavailable", { status: 502 });
  }
}
