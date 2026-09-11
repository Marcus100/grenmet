import "server-only";
import {
  createClient,
  readHrDashboardApiV1HrDashboardGet,
} from "@barrelsgd/api-client";
import { getAuthApiBaseUrl, getAuthApiPrefix } from "@/lib/auth-config";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";

const API_PREFIX = /\/api\/v1(?=\/|$)/;

export async function loadDashboard() {
  const sessionToken = await readSessionCookie();
  if (!sessionToken) throw new Error("Sign in to view HR records");
  const session = await exchangeSessionForAccessToken(sessionToken);
  const client = createClient({
    baseURL: getAuthApiBaseUrl(),
    headers: { Authorization: `Bearer ${session.access_token}` },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, getAuthApiPrefix()),
    signal: AbortSignal.timeout(10_000),
  }));
  client.interceptors.error.use(() => {
    throw new Error("HR records are temporarily unavailable");
  });
  return readHrDashboardApiV1HrDashboardGet({ client }).unwrap();
}
