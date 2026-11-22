import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { AUTH_API_URL: "http://api.test", AUTH_API_V1_STR: "/api/v1" },
}));
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));

import { GET } from "./route";

const ID = "6f1d2c3e-0000-4000-8000-000000000001";
const call = (id: string) =>
  GET(new Request("http://bookings.test/files/x"), {
    params: Promise.resolve({ id }),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /files/[id]", () => {
  it("passes through the API's cached redirect for a public logo", async () => {
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

  it("answers 502 and reports when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    expect((await call(ID)).status).toBe(502);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(TypeError),
      "studio-logo"
    );
  });
});
