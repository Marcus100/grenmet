import type { NextResponse } from "next/server";

/**
 * Hash marker on the success redirect of the single sign-on callback. A hash
 * never reaches the server, so no route or log sees it; the landing page reads
 * it once, records `sign_in_completed` and removes it.
 */
export const SIGN_IN_COMPLETED_HASH = "sign-in-completed";

/**
 * Adds the marker to a same-origin success redirect. The expired or refused
 * redirect (`sign_in=expired`) and any other origin are left unchanged.
 */
export function markSignInCompleted(
  response: NextResponse,
  requestOrigin: string
): NextResponse {
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status >= 400) {
    return response;
  }
  let target: URL;
  try {
    target = new URL(location, requestOrigin);
  } catch {
    return response;
  }
  if (target.origin !== requestOrigin || target.searchParams.has("sign_in")) {
    return response;
  }
  target.hash = SIGN_IN_COMPLETED_HASH;
  response.headers.set("location", target.toString());
  return response;
}
