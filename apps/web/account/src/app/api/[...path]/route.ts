import { isAuthApiError } from "@barrelsgd/auth";
import {
  clearSessionCookieOnResponse,
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildApiProxyUrl } from "@/lib/api-proxy-target";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";
import { isSameOrigin, isWriteMethod } from "@/lib/request-guards";

/**
 * Largest request body the proxy will read. A profile photo may be 5 MB (the
 * API's limit, which it enforces with its own 413 message); the margin keeps
 * that message reachable while still stopping an unbounded upload here.
 */
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

/** The only API zone the browser may reach through this app. */
const API_PREFIX = "/api/v1/";

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
    if (value !== null) upstreamHeaders.set(name, value);
  }
  upstreamHeaders.set("authorization", `Bearer ${accessToken}`);
  return upstreamHeaders;
}

type BoundedBody =
  | { status: "ok"; body: ArrayBuffer | undefined }
  | { status: "too-large" };

/** Reads the body up to MAX_REQUEST_BYTES, never more than that into memory. */
async function readBoundedBody(request: NextRequest): Promise<BoundedBody> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { status: "ok", body: undefined };
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return { status: "too-large" };
  }
  if (!request.body) return { status: "ok", body: undefined };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return { status: "too-large" };
    }
    chunks.push(value);
  }
  if (total === 0) return { status: "ok", body: undefined };

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok", body: body.buffer };
}

function buildProxyResponse(upstreamResponse: Response): NextResponse {
  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const headerName of HOP_BY_HOP_RESPONSE_HEADERS) {
    responseHeaders.delete(headerName);
  }
  // A redirect (307 to presigned storage for a photo) is passed through as is:
  // the browser follows it, and the proxy never follows it itself.
  return new NextResponse(upstreamResponse.body, {
    headers: responseHeaders,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  const config = getAuthConfig();
  const { pathname, search } = request.nextUrl;
  if (!pathname.startsWith(API_PREFIX)) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }

  const upstreamUrl = buildApiProxyUrl(pathname, search, config.authApiBaseUrl);
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

  const sessionToken = await readSessionCookie(config);
  if (!sessionToken) {
    return NextResponse.json(
      { detail: "Authentication required." },
      { status: 401 }
    );
  }

  let accessToken: string;
  try {
    const session = await exchangeSessionForAccessToken(config, sessionToken);
    accessToken = session.access_token;
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      const response = NextResponse.json(
        { detail: error.detail },
        { status: 401 }
      );
      clearSessionCookieOnResponse(config, response);
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

  const bounded = await readBoundedBody(request);
  if (bounded.status === "too-large") {
    return NextResponse.json(
      { detail: "The request is too large." },
      { status: 413 }
    );
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    body: bounded.body,
    cache: "no-store",
    headers: buildUpstreamHeaders(request, accessToken),
    method: request.method,
    redirect: "manual",
  });

  const response = buildProxyResponse(upstreamResponse);
  if (upstreamResponse.status === 401) {
    clearSessionCookieOnResponse(config, response);
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
