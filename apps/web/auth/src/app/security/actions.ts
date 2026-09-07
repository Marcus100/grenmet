"use server";
import {
  createClient,
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

const API_PREFIX = /\/api\/v1(?=\/|$)/;
async function securityClient() {
  const token = await readSessionCookie();
  if (!token) throw new Error("Sign in to manage account security");
  const session = await exchangeSessionForAccessToken(token);
  const config = getAuthConfig();
  // An isolated instance keeps one user's bearer token out of shared server state.
  const client = createClient({
    baseURL: config.authApiBaseUrl,
    headers: { Authorization: `Bearer ${session.access_token}` },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, config.authApiPrefix),
    signal: AbortSignal.timeout(10_000),
  }));
  client.interceptors.error.use(() => {
    throw new Error(
      "Unable to update security settings. Check your code and try again."
    );
  });
  return client;
}
export async function loadSecurity() {
  return readAccountSecurityApiV1AuthModernSecurityGet({
    ...{
      client: await securityClient(),
    },
  }).unwrap();
}
export async function beginMfa() {
  return twofaSetupApiV12FaSetupPost({
    client: await securityClient(),
  }).unwrap();
}
export async function activateMfa(code: string) {
  return twofaActivateApiV12FaActivatePost({
    body: { code },
    client: await securityClient(),
  }).unwrap();
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string
) {
  await updatePasswordMeApiV1AuthUsersMePasswordPatch({
    body: { current_password: currentPassword, new_password: newPassword },
    client: await securityClient(),
  }).unwrap();
  await clearSessionCookie();
}
export async function replaceRecoveryCodes(password: string, code: string) {
  return replaceRecoveryCodesApiV1AuthModernSecurityRecoveryCodesPost({
    body: { password, code },
    client: await securityClient(),
  }).unwrap();
}
export async function disableMfa(password: string, code: string) {
  return twofaDisableApiV12FaDisablePost({
    body: { password, code },
    client: await securityClient(),
  }).unwrap();
}
export async function revokeSecuritySession(id: string) {
  return revokeSecuritySessionApiV1AuthModernSecuritySessionsSessionIdDelete({
    path: { session_id: id },
    client: await securityClient(),
  }).unwrap();
}
