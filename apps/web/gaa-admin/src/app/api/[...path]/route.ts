import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildApiProxyUrl } from "@/lib/api-proxy-target";
import { getAuthApiBaseUrl } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";
import { isSameOrigin, isWriteMethod } from "@/lib/request-guards";
import {
  clearSessionCookieOnResponse,
  exchangeSessionForAccessToken,
  isAuthApiError,
  readSessionCookie,
} from "@/lib/server-session";

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Request headers passed to FastAPI. Everything else is dropped: the browser
 * cookie (the session is exchanged for the bearer token), x-forwarded-* (the API
 * reads its own proxy's), and any header a caller adds to steer the upstream.
 */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-unmodified-since",
  "range",
  "x-request-id",
] as const;

function buildUpstreamHeaders(
  request: NextRequest,
  accessToken: string
): Headers {
  const upstreamHeaders = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      upstreamHeaders.set(name, value);
    }
  }
  upstreamHeaders.set("authorization", `Bearer ${accessToken}`);

  return upstreamHeaders;
}

function buildUpstreamBody(
  request: NextRequest
): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return Promise.resolve(undefined);
  }

  return request
    .arrayBuffer()
    .then((body) => (body.byteLength > 0 ? body : undefined));
}

function buildProxyResponse(upstreamResponse: Response): NextResponse {
  const responseHeaders = new Headers(upstreamResponse.headers);

  for (const headerName of HOP_BY_HOP_RESPONSE_HEADERS) {
    responseHeaders.delete(headerName);
  }

  return new NextResponse(upstreamResponse.body, {
    headers: responseHeaders,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  const upstreamUrl = buildApiProxyUrl(
    request.nextUrl.pathname,
    request.nextUrl.search,
    getAuthApiBaseUrl()
  );
  if (!upstreamUrl) {
    return NextResponse.json(
      { detail: "Invalid request path." },
      { status: 400 }
    );
  }

  if (isWriteMethod(request.method) && !isSameOrigin(request.headers)) {
    return NextResponse.json(
      { detail: "Request origin not allowed." },
      { status: 403 }
    );
  }

  const sessionToken = await readSessionCookie();
  if (!sessionToken) {
    return NextResponse.json(
      { detail: "Authentication required." },
      { status: 401 }
    );
  }

  let accessToken: string;
  try {
    const session = await exchangeSessionForAccessToken(sessionToken);
    accessToken = session.access_token;
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      const response = NextResponse.json(
        { detail: error.detail },
        { status: 401 }
      );
      clearSessionCookieOnResponse(response);
      return response;
    }
    reportError(error, "api-proxy");

    return NextResponse.json(
      {
        detail: isAuthApiError(error)
          ? error.detail
          : "Unable to reach the auth service.",
      },
      { status: 503 }
    );
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    body: await buildUpstreamBody(request),
    cache: "no-store",
    headers: buildUpstreamHeaders(request, accessToken),
    method: request.method,
    redirect: "manual",
  });

  const response = buildProxyResponse(upstreamResponse);

  if (upstreamResponse.status === 401) {
    clearSessionCookieOnResponse(response);
  }

  return response;
}

export {
  handleProxy as DELETE,
  handleProxy as GET,
  handleProxy as HEAD,
  handleProxy as OPTIONS,
  handleProxy as PATCH,
  handleProxy as POST,
  handleProxy as PUT,
};
