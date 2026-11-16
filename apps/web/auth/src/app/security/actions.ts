"use server";
import {
  authGetAccountSecurity,
  authReplaceRecoveryCodes,
  authRevokeSecuritySession,
  authTwofaActivate,
  authTwofaDisable,
  authTwofaSetup,
  authUpdatePasswordMe,
  createClient,
} from "@barrelsgd/api-client";
import { getEffectiveAccess } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";
import {
  clearSessionCookie,
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/session";

const API_PREFIX = /\/api\/v1(?=\/|$)/u;
// The API answers 429 when a limit on these routes is reached: a one-minute window, or
// the account lockout after repeated wrong codes or passwords (#1533), which lasts longer.
const TOO_MANY_ATTEMPTS =
  "Too many attempts. Wait a few minutes and try again.";
async function securityClient(accessToken?: string) {
  let bearerToken = accessToken;
  if (!bearerToken) {
    const token = await readSessionCookie();
    if (!token) throw new Error("Sign in to manage account security");
    const session = await exchangeSessionForAccessToken(token);
    bearerToken = session.access_token;
  }
  const config = getAuthConfig();
  // An isolated instance keeps one user's bearer token out of shared server state.
  const client = createClient({
    baseURL: config.authApiBaseUrl,
    headers: { Authorization: `Bearer ${bearerToken}` },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, config.authApiPrefix),
    signal: AbortSignal.timeout(10_000),
  }));
  client.interceptors.error.use((error) => {
    if (error.status === 429) {
      throw new Error(TOO_MANY_ATTEMPTS);
    }
    throw new Error(
      "Unable to update security settings. Check your code and try again."
    );
  });
  return client;
}
export async function loadSecurity() {
  const token = await readSessionCookie();
  if (!token) throw new Error("Sign in to manage account security");
  const currentSession = await exchangeSessionForAccessToken(token);
  const security = await authGetAccountSecurity({
    ...{
      client: await securityClient(currentSession.access_token),
    },
  }).unwrap();
  return {
    ...security,
    current_session_mfa_verified: Boolean(
      currentSession.session.mfa_verified_at
    ),
  };
}
export async function beginMfa() {
  return authTwofaSetup({
    client: await securityClient(),
  }).unwrap();
}
export async function activateMfa(code: string, emailCode?: string) {
  return authTwofaActivate({
    body: { code, email_code: emailCode },
    client: await securityClient(),
  }).unwrap();
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string
) {
  await authUpdatePasswordMe({
    body: { current_password: currentPassword, new_password: newPassword },
    client: await securityClient(),
  }).unwrap();
  await clearSessionCookie();
}
/** `password` is undefined for an email-code account, which has none to confirm. */
export async function replaceRecoveryCodes(
  password: string | undefined,
  code: string
) {
  return authReplaceRecoveryCodes({
    body: { password, code },
    client: await securityClient(),
  }).unwrap();
}
export async function disableMfa(password: string, code: string) {
  return authTwofaDisable({
    body: { password, code },
    client: await securityClient(),
  }).unwrap();
}
export async function revokeSecuritySession(id: string) {
  return authRevokeSecuritySession({
    path: { session_id: id },
    client: await securityClient(),
  }).unwrap();
}

export async function loadAccess() {
  const token = await readSessionCookie();
  if (!token) throw new Error("Sign in to view access");
  const session = await exchangeSessionForAccessToken(token);
  return getEffectiveAccess(getAuthConfig(), session.access_token);
}
