import "server-only";

import { isAuthApiError } from "@barrelsgd/auth";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuthConfig } from "@/lib/auth-config";

/**
 * Who is looking at the control plane, decided on the server for every request.
 *
 * Barrels staff only: the account must be an active superuser. Middleware
 * (`proxy.ts`) only checks that a cookie exists; this is the real check, and
 * FastAPI re-checks it on every call, so a stale page never grants anything.
 */
export type StaffGate =
  | { status: "signed-out" }
  | { status: "refused"; email: string }
  | { status: "staff"; accessToken: string; email: string; name: string };

interface ExchangedUser {
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
}

/** Pure decision, kept apart from I/O so the rule is unit-tested directly. */
export function decideGate(
  user: ExchangedUser,
  accessToken: string
): Exclude<StaffGate, { status: "signed-out" }> {
  if (user.is_active && user.is_superuser) {
    return {
      status: "staff",
      accessToken,
      email: user.email,
      name: user.full_name || user.email,
    };
  }
  return { status: "refused", email: user.email };
}

export const getStaffGate = cache(async (): Promise<StaffGate> => {
  const config = getAuthConfig();
  const sessionToken = await readSessionCookie(config);
  if (!sessionToken) return { status: "signed-out" };
  try {
    const { access_token, user } = await exchangeSessionForAccessToken(
      config,
      sessionToken
    );
    return decideGate(user, access_token);
  } catch (error) {
    // 401/403: the session ended, was revoked, or the account lost access.
    // Signing in again explains why on auth.barrels.gd.
    if (
      isAuthApiError(error) &&
      (error.status === 401 || error.status === 403)
    ) {
      return { status: "signed-out" };
    }
    throw error;
  }
});

/** For pages: send signed-out visitors to sign in, hand back the gate otherwise. */
export async function requireGate(
  returnTo = "/"
): Promise<Exclude<StaffGate, { status: "signed-out" }>> {
  const gate = await getStaffGate();
  if (gate.status === "signed-out") {
    redirect(`/signin?${new URLSearchParams({ returnTo })}`);
  }
  return gate;
}
