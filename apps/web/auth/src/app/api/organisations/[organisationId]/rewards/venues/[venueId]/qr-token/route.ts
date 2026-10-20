import { getVenueQrToken } from "@/lib/org-rewards";
import { classifyFailure } from "@/lib/org-rewards-errors";
import { isUuid, ORGANISATION_ID } from "@/lib/org-rewards-options";
import { reportError } from "@/lib/report-error";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/session";

/**
 * Proxy for the venue display screen: it validates the ids, signs the call
 * with the caller's own session, and relays the API's answer. It holds no
 * state and no business rules. The code is a short-lived secret, so every
 * answer, including errors, is marked `no-store`.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { headers: NO_STORE, status });
}

const FAILURE_STATUS = {
  forbidden: 403,
  "not-entitled": 403,
  "not-found": 404,
  unauthorised: 401,
} as const;

interface Context {
  params: Promise<{ organisationId: string; venueId: string }>;
}

export async function GET(_request: Request, { params }: Context) {
  const { organisationId, venueId } = await params;
  if (!(ORGANISATION_ID.test(organisationId) && isUuid(venueId))) {
    return reply(400, { error: "invalid" });
  }
  const session = await readSessionCookie();
  if (!session) return reply(401, { error: "unauthorised" });

  try {
    const { access_token: token } =
      await exchangeSessionForAccessToken(session);
    const code = await getVenueQrToken(token, organisationId, venueId);
    return reply(200, {
      refresh_after_seconds: code.refresh_after_seconds,
      token: code.token,
      window_seconds: code.window_seconds,
    });
  } catch (error) {
    const kind = classifyFailure(error);
    if (
      kind === "forbidden" ||
      kind === "not-entitled" ||
      kind === "not-found" ||
      kind === "unauthorised"
    ) {
      return reply(FAILURE_STATUS[kind], { error: kind });
    }
    reportError(error, "org-rewards-qr-token");
    return reply(502, { error: "unavailable" });
  }
}
