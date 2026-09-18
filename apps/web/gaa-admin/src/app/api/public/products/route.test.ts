import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://fastapi.test",
  getAuthApiPrefix: () => "/api/v1",
}));

import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

function request(query = "") {
  return new Request(`http://admin.test/api/public/products${query}`, {
    headers: { cookie: "session=private", authorization: "Bearer private" },
  });
}

describe("weather product forwarding", () => {
  it("forwards the public filter without browser credentials and disables caching", async () => {
    const body = { products: [{ id: "published-snapshot" }] };
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request("?kind=marine"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "http://fastapi.test/api/v1/wxproducts/public/products?kind=marine"
      ),
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("headers");
  });
  it("rejects invalid kinds without contacting FastAPI", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await GET(request("?kind=unknown"))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps a successful empty feed distinct from an outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ products: [] }))
    );
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ products: [] });
  });
  it.each(["error", "timeout", "invalid-json"])(
    "returns a generic 503 for %s",
    async (failure) => {
      const fetcher = vi.fn();
      if (failure === "error")
        fetcher.mockResolvedValue(
          new Response("private backend error", { status: 500 })
        );
      else if (failure === "timeout")
        fetcher.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
      else fetcher.mockResolvedValue(new Response("not json"));
      vi.stubGlobal("fetch", fetcher);
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error: "Product information is unavailable",
      });
    }
  );
});
