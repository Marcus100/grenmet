import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { type HandoffRequest, handoffRequestFromReturnTo } from "./handoff";

/**
 * Proof that this person chose to sign in for one app, so /continue may join an
 * instant-join app without asking "Join <app>?" a second time.
 *
 * Why it exists: /continue is a GET, and its `state` is a random value only the
 * requesting app can check (against its own cookie, at its callback). Auth
 * cannot tell an app-started request from a link anyone wrote, so a join done
 * on that GET alone could be triggered by any link. The mark is written only by
 * the emailed-code server action (a same-origin POST the person completed by
 * typing their code on the page that names the app), and it is bound to:
 *   - the account session that sign-in created (its secret is the HMAC key),
 *   - the app and the exact `state` of the request being signed in for,
 *   - an expiry two minutes out: the redirect to /continue follows at once,
 *     and nothing clears the cookie afterwards, so it is kept short.
 * Without the session secret the value cannot be forged, and it is useless for
 * any other session, app or request.
 */
const COOKIE_NAME = "auth_join_intent";
const LIFETIME_SECONDS = 120;
const VALUE = /^(\d{1,15})\.([0-9a-f]{64})$/u;

function proof(
  request: HandoffRequest,
  sessionToken: string,
  expiresAt: number
): string {
  // Neither an app key nor a state can hold a newline (see parseHandoffRequest).
  return createHmac("sha256", sessionToken)
    .update([request.app, request.state, expiresAt].join("\n"))
    .digest("hex");
}

/** Call right after a code sign-in sets the session, with its validated returnTo. */
export async function rememberJoinIntent(
  returnTo: string | null,
  sessionToken: string
): Promise<void> {
  const request = handoffRequestFromReturnTo(returnTo);
  if (!request) return;
  const expiresAt = Math.floor(Date.now() / 1000) + LIFETIME_SECONDS;
  const jar = await cookies();
  jar.set(
    COOKIE_NAME,
    `${expiresAt}.${proof(request, sessionToken, expiresAt)}`,
    {
      httpOnly: true,
      maxAge: LIFETIME_SECONDS,
      // Only /continue reads it, and only on the same-site navigation that
      // follows the sign-in; a link from another site never carries it.
      path: "/continue",
      sameSite: "strict",
      secure: env.NODE_ENV === "production",
    }
  );
}

/** Whether this session signed in, minutes ago, for exactly this request. */
export async function hasJoinIntent(
  request: HandoffRequest,
  sessionToken: string
): Promise<boolean> {
  const jar = await cookies();
  const match = VALUE.exec(jar.get(COOKIE_NAME)?.value ?? "");
  if (!match) return false;
  const expiresAt = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt <= now || expiresAt > now + LIFETIME_SECONDS) return false;
  const given = Buffer.from(match[2] ?? "", "hex");
  const expected = Buffer.from(proof(request, sessionToken, expiresAt), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
