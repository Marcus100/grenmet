import "server-only";

import { isAuthApiError } from "@barrelsgd/auth";
import {
  exchangeSessionForAccessToken,
  getEffectiveAccess,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuthConfig } from "./auth-config";
import { type DeskPermissions, deskPermissions } from "./permissions";

/**
 * Who is at the warning desk, decided on the server for every request.
 *
 * `proxy.ts` only checks that the cookie exists. This is the real check: the
 * session must exchange for a staff token (the API refuses anyone who is not
 * approved staff) and the account must hold `cap.alert.read`. FastAPI checks
 * each permission again on every call.
 */
export type DeskGate =
  | { status: "signed-out" }
  | { status: "refused"; email: string }
  | {
      status: "staff";
      accessToken: string;
      email: string;
      name: string;
      permissions: DeskPermissions;
      userId: string;
    };

export const getDeskGate = cache(async (): Promise<DeskGate> => {
  const config = getAuthConfig();
  const sessionToken = await readSessionCookie(config);
  if (!sessionToken) return { status: "signed-out" };
  try {
    const { access_token, user } = await exchangeSessionForAccessToken(
      config,
      sessionToken
    );
    const access = await getEffectiveAccess(config, access_token);
    const permissions = deskPermissions(access);
    if (!(user.is_active && permissions.read)) {
      return { status: "refused", email: user.email };
    }
    return {
      status: "staff",
      accessToken: access_token,
      email: user.email,
      name: user.full_name || user.email,
      permissions,
      userId: user.id,
    };
  } catch (error) {
    // 401/403: the session ended, was revoked, or the account lost staff access.
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
export async function requireDeskGate(
  returnTo = "/desk"
): Promise<Exclude<DeskGate, { status: "signed-out" }>> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    redirect(`/desk/signin?${new URLSearchParams({ returnTo })}`);
  }
  return gate;
}
