import {
  authExchangeSessionForAccessToken,
  authGetEffectiveAccess,
  authGetUserMe,
  createClient,
  hrGetHrProfileMe,
  ResponseError,
} from "@barrelsgd/api-client";
import type { AuthConfig } from "@barrelsgd/auth";

export interface StaffIdentity {
  email: string;
  fastapiUserId: string;
  isSuperuser: boolean;
  permissionKeys?: string[];
  username: string;
}
export async function readFastApiIdentity(
  headers: Headers,
  config: AuthConfig,
  departmentId: string
): Promise<StaffIdentity | null> {
  const cookie = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${config.sessionCookieName}=`));
  if (!cookie) return null;
  let sessionToken: string;
  try {
    sessionToken = decodeURIComponent(
      cookie.slice(config.sessionCookieName.length + 1)
    );
  } catch {
    return null;
  }
  if (!sessionToken) return null;
  try {
    const anonymous = createClient({
      options: { cache: "no-store" },
      baseURL: config.authApiBaseUrl,
    });
    const session = await authExchangeSessionForAccessToken({
      client: anonymous,
      signal: AbortSignal.timeout(10_000),
      body: { session_token: sessionToken },
    }).unwrap();
    if (!session.user.is_active) return null;
    const client = createClient({
      options: { cache: "no-store" },
      baseURL: config.authApiBaseUrl,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const user = await authGetUserMe({
      client,
      signal: AbortSignal.timeout(10_000),
    }).unwrap();
    if (!user.is_active || user.id !== session.user.id) return null;
    if (!user.is_superuser) {
      const profile = await hrGetHrProfileMe({
        client,
        signal: AbortSignal.timeout(10_000),
      }).unwrap();
      if (
        profile.id !== user.id ||
        profile.identity.status !== "ACTIVE" ||
        profile.employment.status !== "ACTIVE" ||
        profile.employment.department?.id.toUpperCase() !==
          departmentId.toUpperCase()
      )
        return null;
    }
    const access = await authGetEffectiveAccess({
      client,
      signal: AbortSignal.timeout(10_000),
    }).unwrap();
    return {
      fastapiUserId: user.id,
      username: user.username,
      email: user.email,
      isSuperuser: Boolean(user.is_superuser),
      permissionKeys: access?.permission_keys ?? [],
    };
  } catch (error) {
    if (
      error instanceof ResponseError &&
      [401, 403, 404].includes(error.status)
    )
      return null;
    throw error;
  }
}
