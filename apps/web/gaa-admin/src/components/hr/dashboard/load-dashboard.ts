import "server-only";
import { readHrDashboardApiV1HrDashboardGet } from "@barrelsgd/api-client";
import { getAuthApiBaseUrl, getAuthApiPrefix } from "@/lib/auth-config";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";

type Transport = NonNullable<
  NonNullable<
    Parameters<typeof readHrDashboardApiV1HrDashboardGet>[0]
  >["client"]
>;

export async function loadDashboard() {
  const sessionToken = await readSessionCookie();
  if (!sessionToken) throw new Error("Sign in to view HR records");
  const session = await exchangeSessionForAccessToken(sessionToken);
  const transport: Transport = async <T>(config: {
    url: string;
    method: string;
  }) => {
    const path = config.url.replace(API_PREFIX, getAuthApiPrefix());
    const response = await fetch(`${getAuthApiBaseUrl()}${path}`, {
      method: config.method,
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("HR records are temporarily unavailable");
    const data = (await response.json()) as T;
    return { data, status: response.status, statusText: response.statusText };
  };
  return readHrDashboardApiV1HrDashboardGet({ client: transport });
}

const API_PREFIX = /^\/api\/v1/;
