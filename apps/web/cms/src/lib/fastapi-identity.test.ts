import type { AuthConfig } from "@barrelsgd/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFastApiIdentity } from "./fastapi-identity";

const config: AuthConfig = {
  appName: "cms",
  authApiBaseUrl: "https://api.test",
  authApiPrefix: "/api/v1",
  authAppUrl: "https://auth.test",
  sessionCookieName: "grenmet_session",
};
const requestHeaders = new Headers({ cookie: "grenmet_session=valid-session" });
function mockIdentity({
  active = true,
  allowed = true,
  superuser = false,
} = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (!(input instanceof Request)) throw new Error("Expected Request");
    expect(input.cache).toBe("no-store");
    const url = new URL(input.url);
    if (url.pathname.endsWith("/session/access-token")) {
      expect(await input.json()).toEqual({ session_token: "valid-session" });
      return Response.json({
        user: { id: "staff-id", is_active: active },
        access_token: "validated-token",
      });
    }
    expect(input.headers.get("authorization")).toBe("Bearer validated-token");
    if (url.pathname.endsWith("/apps/cms/me")) {
      if (!allowed) return Response.json({}, { status: 401 });
      return Response.json({
        id: "staff-id",
        username: "staff.name",
        email: "staff@example.test",
        is_active: active,
        is_superuser: superuser,
        permission_keys: ["cms.article.create"],
      });
    }
    throw new Error(`Unexpected identity request: ${url.pathname}`);
  });
}
afterEach(() => vi.restoreAllMocks());
describe("FastAPI is the identity authority", () => {
  it("reads the existing session and authoritative username", async () => {
    mockIdentity();
    expect(await readFastApiIdentity(requestHeaders, config)).toEqual({
      fastapiUserId: "staff-id",
      permissionKeys: ["cms.article.create"],
      username: "staff.name",
      email: "staff@example.test",
      isSuperuser: false,
    });
  });
  it.each([{ active: false }, { allowed: false }])(
    "denies revoked access or inactive accounts: %j",
    async (options) => {
      mockIdentity(options);
      expect(await readFastApiIdentity(requestHeaders, config)).toBeNull();
    }
  );
  it("allows FastAPI superusers to administer the CMS", async () => {
    const fetchMock = mockIdentity({ superuser: true });
    expect(
      (await readFastApiIdentity(requestHeaders, config))?.isSuperuser
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects revoked sessions without falling back to a cached CMS identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ detail: "Expired session" }, { status: 401 })
    );
    expect(await readFastApiIdentity(requestHeaders, config)).toBeNull();
  });
  it("does not authenticate missing or malformed cookies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await readFastApiIdentity(new Headers(), config)).toBeNull();
    expect(
      await readFastApiIdentity(
        new Headers({ cookie: "grenmet_session=%ZZ" }),
        config
      )
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("surfaces an unavailable auth service instead of authenticating locally", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({}, { status: 503 })
    );
    await expect(readFastApiIdentity(requestHeaders, config)).rejects.toThrow();
  });
});
