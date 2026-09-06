import { AuthApiError } from "@barrelsgd/auth";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./env", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("./auth-config", () => ({
  getAuthConfig: () => ({
    appName: "auth",
    authApiBaseUrl: "https://auth-api.test",
    authApiPrefix: "/backend/v1",
    authAppUrl: "/",
    sessionCookieName: "session",
  }),
}));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers({ "user-agent": "test-browser", "x-request-id": "trace-123" })
    ),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

import { googleStart } from "./modern-auth";

afterEach(() => vi.restoreAllMocks());

it("preserves forwarded headers, JSON body, prefix, and timeout through the Kubb transport", async () => {
  const response = { authorization_url: "https://accounts.google.com/example" };
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json(response));
  const body = { browser_binding: "a".repeat(64) };
  await expect(googleStart(body)).resolves.toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe("https://auth-api.test/backend/v1/auth/modern/google/start");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual(body);
  expect(new Headers(init?.headers).get("user-agent")).toBe("test-browser");
  expect(new Headers(init?.headers).get("x-request-id")).toBe("trace-123");
  expect(init?.cache).toBe("no-store");
  expect(init?.signal).toBeInstanceOf(AbortSignal);
});

it("preserves the auth error contract for a rejected Google request", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ detail: "Google is unavailable" }, { status: 503 })
  );
  await expect(
    googleStart({ browser_binding: "a".repeat(64) })
  ).rejects.toBeInstanceOf(AuthApiError);
});
