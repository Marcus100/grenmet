import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCapApiBaseUrl } from "@/lib/auth-config";
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

function buildUpstreamHeaders(
  request: NextRequest,
  accessToken: string
): Headers {
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("authorization", `Bearer ${accessToken}`);
  upstreamHeaders.delete("connection");
  upstreamHeaders.delete("content-length");
  upstreamHeaders.delete("host");
  return upstreamHeaders;
}

async function buildUpstreamBody(
  request: NextRequest
): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return;
  }
  const body = await request.arrayBuffer();
  return body.byteLength > 0 ? body : undefined;
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

    return NextResponse.json(
      {
        detail: isAuthApiError(error)
          ? error.detail
          : "Unable to reach the auth service.",
      },
      { status: 503 }
    );
  }

  const upstreamUrl = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    getCapApiBaseUrl()
  );
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
