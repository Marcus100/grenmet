import { isAuthApiError } from "@barrelsgd/auth";
import { NextResponse } from "next/server";

/**
 * Map an auth API failure to a safe JSON response. Expected 4xx detail is
 * passed through (wrong code, rate limit); anything else is reported and
 * replaced with a generic message.
 */
export function authErrorResponse(
  error: unknown,
  report: (error: unknown, area: string) => void
): NextResponse {
  if (isAuthApiError(error) && error.status >= 400 && error.status < 500) {
    return NextResponse.json(
      { detail: error.detail },
      { status: error.status }
    );
  }
  report(error, "events-auth");
  return NextResponse.json(
    { detail: "Sign-in is unavailable right now. Try again shortly." },
    { status: 503 }
  );
}
