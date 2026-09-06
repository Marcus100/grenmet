"use server";
import {
  readAccountSecurityApiV1AuthModernSecurityGet,
  replaceRecoveryCodesApiV1AuthModernSecurityRecoveryCodesPost,
  revokeSecuritySessionApiV1AuthModernSecuritySessionsSessionIdDelete,
  twofaActivateApiV12FaActivatePost,
  twofaDisableApiV12FaDisablePost,
  twofaSetupApiV12FaSetupPost,
  updatePasswordMeApiV1AuthUsersMePasswordPatch,
} from "@barrelsgd/api-client";
import { getAuthConfig } from "@/lib/auth-config";
import {
  clearSessionCookie,
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/session";

type Transport = NonNullable<
  NonNullable<
    Parameters<typeof readAccountSecurityApiV1AuthModernSecurityGet>[0]
  >["client"]
>;
const API_PREFIX = /^\/api\/v1/;
async function securityClient(): Promise<Transport> {
  const token = await readSessionCookie();
  if (!token) throw new Error("Sign in to manage account security");
  const session = await exchangeSessionForAccessToken(token);
  const config = getAuthConfig();
  return async <T>(request: {
    url: string;
    method: string;
    data?: unknown;
  }) => {
    const response = await fetch(
      `${config.authApiBaseUrl}${request.url.replace(API_PREFIX, config.authApiPrefix)}`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        ...(request.data === undefined
          ? {}
          : { body: JSON.stringify(request.data) }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok)
      throw new Error(
        "Unable to update security settings. Check your code and try again."
      );
    const data = (await response.json()) as T;
    return { data, status: response.status, statusText: response.statusText };
  };
}
export async function loadSecurity() {
  return readAccountSecurityApiV1AuthModernSecurityGet({
    client: await securityClient(),
  });
}
export async function beginMfa() {
  return twofaSetupApiV12FaSetupPost({ client: await securityClient() });
}
export async function activateMfa(code: string) {
  return twofaActivateApiV12FaActivatePost(
    { code },
    { client: await securityClient() }
  );
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string
) {
  await updatePasswordMeApiV1AuthUsersMePasswordPatch(
    { current_password: currentPassword, new_password: newPassword },
    { client: await securityClient() }
  );
  await clearSessionCookie();
}
export async function replaceRecoveryCodes(password: string, code: string) {
  return replaceRecoveryCodesApiV1AuthModernSecurityRecoveryCodesPost(
    { password, code },
    { client: await securityClient() }
  );
}
export async function disableMfa(password: string, code: string) {
  return twofaDisableApiV12FaDisablePost(
    { password, code },
    { client: await securityClient() }
  );
}
export async function revokeSecuritySession(id: string) {
  return revokeSecuritySessionApiV1AuthModernSecuritySessionsSessionIdDelete(
    id,
    { client: await securityClient() }
  );
}
