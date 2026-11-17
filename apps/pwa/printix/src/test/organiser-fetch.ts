import { vi } from "vitest";

/** The API origin the organiser tests use. Never a real address. */
export const ORIGIN = "https://api.example.test";

/** One canned answer. Requests are passed in so a test can read their headers and bodies. */
export type Handler = (request: Request) => Response | Promise<Response>;

/** Routes keyed by "METHOD /path". A route with no handler answers 599, so a missing route fails loudly. */
export type Routes = Record<string, Handler>;

export function json(
  status: number,
  body: unknown,
  headers?: HeadersInit
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * Stubs global fetch with the given routes and returns the spy, so a test can
 * count requests and read them. Call vi.unstubAllGlobals in afterEach.
 */
export function routeFetch(routes: Routes) {
  const spy = vi.fn((request: Request) => {
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const handler = routes[key];
    if (!handler) {
      return new Response(`no route for ${key}`, { status: 599 });
    }
    return handler(request);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** How many requests the spy saw for one "METHOD /path" key. */
export function countCalls(
  spy: ReturnType<typeof routeFetch>,
  key: string
): number {
  return spy.mock.calls.filter(([request]) => {
    const [method, path] = key.split(" ");
    return request.method === method && new URL(request.url).pathname === path;
  }).length;
}

/** A session answer shaped like the API's SessionLoginResponse. */
export function loginBody(overrides: {
  readonly accessToken?: string;
  readonly sessionToken?: string;
  readonly accessExpiresInMs?: number;
  readonly email?: string;
}) {
  const now = Date.now();
  const expires = new Date(now + (overrides.accessExpiresInMs ?? 900_000));
  const sessionExpires = new Date(now + 12 * 60 * 60 * 1000);
  return {
    access_token: overrides.accessToken ?? "access-token-one",
    token_type: "bearer",
    access_token_expires_at: expires.toISOString(),
    session_expires_at: sessionExpires.toISOString(),
    session: {
      id: "5a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      user_id: "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
      client_type: "web",
      app_name: "printix",
      mfa_verified_at: new Date(now).toISOString(),
      expires_at: sessionExpires.toISOString(),
      last_used_at: new Date(now).toISOString(),
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
      revoked_at: null,
    },
    user: {
      id: "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
      email: overrides.email ?? "organiser@example.test",
      full_name: "Test Organiser",
      is_active: true,
      is_superuser: false,
    },
    session_token: overrides.sessionToken ?? "s".repeat(43),
  };
}
