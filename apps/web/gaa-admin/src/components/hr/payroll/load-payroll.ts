import "server-only";
import {
  authGetEffectiveAccess,
  createClient,
  type EffectiveAccess,
  hrGetOrganisations,
  type OrganisationPublic,
  ResponseError,
} from "@barrelsgd/api-client";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getAuthAppUrl,
} from "@/lib/auth-config";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";
import { type PayrollAccess, payrollAccess } from "./payroll-access";
import { isMfaRequired } from "./payroll-failure";

const API_PREFIX = /\/api\/v1(?=\/|$)/;

/** A server read: ready with data, or a state the screen shows plainly. */
export type PayrollLoad<T> =
  | { state: "ready"; data: T }
  | { state: "forbidden" }
  | { state: "mfa" }
  | { state: "not_found" };

async function payrollClient() {
  const sessionToken = await readSessionCookie();
  if (!sessionToken) throw new Error("Sign in to view payroll");
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
  return client;
}

/**
 * Run one payroll read. Expected refusals become screen states; anything
 * else is thrown to the route's error boundary.
 */
export async function loadPayroll<T>(
  work: (client: Awaited<ReturnType<typeof payrollClient>>) => Promise<T>
): Promise<PayrollLoad<T>> {
  try {
    return { state: "ready", data: await work(await payrollClient()) };
  } catch (error) {
    if (error instanceof ResponseError) {
      if (isMfaRequired(error)) return { state: "mfa" };
      if (error.status === 403) return { state: "forbidden" };
      if (error.status === 404) return { state: "not_found" };
    }
    throw error;
  }
}

export async function loadEffectiveAccess(): Promise<{
  access: PayrollAccess;
  keys: EffectiveAccess;
}> {
  const client = await payrollClient();
  const keys = await authGetEffectiveAccess({ client }).unwrap();
  return {
    access: payrollAccess(
      keys.all_scope_permission_keys ?? [],
      keys.permission_keys
    ),
    keys,
  };
}

export function loadOrganisations(): Promise<
  PayrollLoad<OrganisationPublic[]>
> {
  return loadPayroll((client) => hrGetOrganisations({ client }).unwrap());
}

/** Two-step verification sign-in lives on the auth app's Security page. */
export function payrollSecurityUrl(): string {
  return new URL("/security", getAuthAppUrl()).toString();
}
