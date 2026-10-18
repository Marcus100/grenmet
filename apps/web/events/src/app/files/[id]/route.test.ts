import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { AUTH_API_URL: "http://api.test", AUTH_API_V1_STR: "/api/v1" },
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { GET } from "./route";

const ID = "6f1d2c3e-0000-4000-8000-000000000001";
const call = (id: string) =>
  GET(new Request("http://events.test/files/x"), {
    params: Promise.resolve({ id }),
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /files/[id]", () => {
  it("passes through the API's cached redirect", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: {
          location: "https://bucket.test/signed",
          "cache-control": "public, max-age=120",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(ID);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.test/api/v1/storage/public/${ID}`,
      { redirect: "manual" }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://bucket.test/signed");
    expect(response.headers.get("cache-control")).toBe("public, max-age=120");
  });

  it("answers 404 for ids that are not UUIDs without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call("../secret")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 404 when the API does not serve the file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 404 }))
    );
    expect((await call(ID)).status).toBe(404);
  });
});
