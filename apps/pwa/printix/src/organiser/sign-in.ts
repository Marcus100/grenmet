// The two sign-in calls (ADR-0061): the emailed code, then the emailed code and
// the authenticator code together. Both use the app-scoped routes for `printix`.

import {
  authAppEmailCodeStart,
  authAppEmailCodeVerify,
} from "@barrelsgd/api-client";
import { failed, type Outcome } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";
import { parseLogin } from "@/organiser/session";

/** The app's name in the sign-in routes (`/auth/apps/{app}/...`). */
export const ORGANISER_APP = "printix";

const REQUEST_TIMEOUT_MS = 15_000;

/** Asks for a 6-digit code by email. The reply is the same for every address. */
export async function requestEmailCode(
  session: OrganiserSession,
  email: string
): Promise<Outcome<true>> {
  session.prepare();
  try {
    await authAppEmailCodeStart({
      path: { app: ORGANISER_APP },
      body: { email },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { ok: true, value: true };
  } catch (error) {
    return failed(error, "organiser-sign-in");
  }
}

export interface SignInCodes {
  /** The 6-digit code from the email. */
  readonly code: string;
  readonly email: string;
  /** The 6-digit code from the person's authenticator app. */
  readonly totpCode: string;
}

/**
 * Checks both codes and, when they pass, stores the session on `session`. The
 * server checks the emailed code first, then the authenticator.
 */
export async function verifySignIn(
  session: OrganiserSession,
  codes: SignInCodes
): Promise<Outcome<true>> {
  session.prepare();
  try {
    const { data } = await authAppEmailCodeVerify({
      path: { app: ORGANISER_APP },
      body: {
        email: codes.email,
        code: codes.code,
        totp_code: codes.totpCode,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    session.adopt(parseLogin(data));
    return { ok: true, value: true };
  } catch (error) {
    return failed(error, "organiser-sign-in");
  }
}
