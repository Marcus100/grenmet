"use server";
import {
  readAccountSecurityApiV1AuthModernSecurityGet,
  twofaActivateApiV12FaActivatePost,
  twofaSetupApiV12FaSetupPost,
} from "@barrelsgd/api-client";
import { getAuthConfig } from "@/lib/auth-config";
import {
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
