import { isAuthApiError } from "@barrelsgd/auth";
import {
  clearSessionCookieOnResponse,
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/desk/auth-config";
import { DESK_API_PREFIX, isAllowedDeskCall } from "@/lib/desk/proxy-rules";
import {
  BodyTooLargeError,
  isSameOrigin,
  readLimitedBody,
} from "@/lib/desk/request-guards";
import { reportError } from "@/lib/report-error";

/**
 * Validate and proxy only (AGENTS.md): the desk's browser calls reach FastAPI
 * here with the forecaster's staff token. No rules live in this file; FastAPI
 * checks every permission and transition.
 */
export const dynamic = "force-dynamic";

const NO_STORE = "private, no-store";

function refuse(status: number, detail: string): NextResponse {
  return NextResponse.json(
    { detail },
    { status, headers: { "Cache-Control": NO_STORE } }
  );
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname.slice(DESK_API_PREFIX.length);
  if (!isAllowedDeskCall(request.method, path)) {
    return refuse(404, "Not found.");
  }
  // Same-site pages on other barrels.gd hosts still send a Lax cookie, so a
  // change must come from this host's own pages.
  if (request.method !== "GET" && !isSameOrigin(request.headers)) {
    return refuse(403, "This request did not come from the warning desk.");
  }

  const config = getAuthConfig();
  const sessionToken = await readSessionCookie(config);
  if (!sessionToken) return refuse(401, "Sign in to the warning desk.");

  let accessToken: string;
  try {
    accessToken = (await exchangeSessionForAccessToken(config, sessionToken))
      .access_token;
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      const response = refuse(401, "Your desk session has ended.");
      clearSessionCookieOnResponse(config, response);
      return response;
    }
    reportError(error, "cap-desk-proxy");
    return refuse(503, "The sign-in service did not answer.");
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
  });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers.set("x-request-id", requestId);

  let body: Uint8Array | undefined;
  if (request.method !== "GET") {
    try {
      body = await readLimitedBody(request);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return refuse(413, "The request is too large.");
      }
      throw error;
    }
  }
  const upstream = await fetch(
    new URL(`${path}${request.nextUrl.search}`, config.authApiBaseUrl),
    {
      body: body && body.byteLength > 0 ? Buffer.from(body) : undefined,
      cache: "no-store",
      headers,
      method: request.method,
      redirect: "manual",
    }
  );

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Cache-Control": NO_STORE,
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
  if (upstream.status === 401) clearSessionCookieOnResponse(config, response);
  return response;
}

export { handle as GET, handle as PATCH, handle as POST };
