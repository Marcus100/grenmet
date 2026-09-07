import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureApiClient,
  createClient,
  createDepartmentEndpointApiV1HrDepartmentsPost,
  loginAccessTokenApiV1LoginAccessTokenPost,
  ResponseError,
  readUserMeApiV1AuthUsersMeGet,
  readUsersApiV1AuthUsersGet,
} from "../src/index.js";

beforeEach(() =>
  configureApiClient({ baseURL: "https://api.test", getHeaders: () => ({}) })
);
afterEach(() => vi.restoreAllMocks());

describe("generated client integration", () => {
  it("serializes query parameters and reads headers at request time", async () => {
    let token = "first";
    configureApiClient({
      getHeaders: () => ({ Authorization: `Bearer ${token}` }),
    });
    const requests: Request[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (!(input instanceof Request))
        throw new Error("Expected a native Request");
      requests.push(input);
      return Promise.resolve(Response.json({ data: [], total: 0 }));
    });
    await readUsersApiV1AuthUsersGet({ query: { page: 2, size: 10 } }).unwrap();
    token = "second";
    const body = await readUsersApiV1AuthUsersGet().unwrap();
    expect(requests[0]?.url).toBe(
      "https://api.test/api/v1/auth/users?page=2&size=10"
    );
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer first");
    expect(requests[1]?.headers.get("Authorization")).toBe("Bearer second");
    expect(requests[0]?.credentials).toBe("same-origin");
    expect(body).toEqual({ data: [], total: 0 });
  });

  it("sends a JSON body and unwraps a created response", async () => {
    const payload = { id: "hr", name: "Human Resources" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (!(input instanceof Request))
        throw new Error("Expected a native Request");
      expect(input.method).toBe("POST");
      expect(input.headers.get("content-type")).toBe("application/json");
      expect(await input.json()).toEqual(payload);
      return Response.json(payload, { status: 201 });
    });
    await expect(
      createDepartmentEndpointApiV1HrDepartmentsPost({ body: payload }).unwrap()
    ).resolves.toEqual(payload);
  });

  it("encodes OAuth login as a form rather than JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (!(input instanceof Request))
        throw new Error("Expected a native Request");
      expect(input.headers.get("content-type")).toBe(
        "application/x-www-form-urlencoded"
      );
      const form = new URLSearchParams(await input.text());
      expect(form.get("username")).toBe("a+b@example.test");
      expect(form.get("password")).toBe("secret & value");
      return Response.json({ access_token: "token", token_type: "bearer" });
    });
    await loginAccessTokenApiV1LoginAccessTokenPost({
      body: { username: "a+b@example.test", password: "secret & value" },
    }).unwrap();
  });

  it("rejects non-success responses with their status and error payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ detail: "Invalid token" }, { status: 403 })
    );
    const error = await readUserMeApiV1AuthUsersMeGet()
      .unwrap()
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ResponseError);
    expect(error).toMatchObject({
      status: 403,
      data: { detail: "Invalid token" },
    });
  });

  it("isolates credentials between server client instances", async () => {
    const seen: Array<string | null> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (!(input instanceof Request))
        throw new Error("Expected a native Request");
      seen.push(input.headers.get("Authorization"));
      return Promise.resolve(Response.json({ id: "user" }));
    });
    const first = createClient({
      baseURL: "https://api.test",
      headers: { Authorization: "Bearer first" },
    });
    const second = createClient({
      baseURL: "https://api.test",
      headers: { Authorization: "Bearer second" },
    });
    await Promise.all([
      readUserMeApiV1AuthUsersMeGet({ client: first }),
      readUserMeApiV1AuthUsersMeGet({ client: second }),
    ]);
    expect(seen).toEqual(["Bearer first", "Bearer second"]);
  });
});
