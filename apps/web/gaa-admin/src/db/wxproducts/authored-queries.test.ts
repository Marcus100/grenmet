import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://api.test",
  getAuthApiPrefix: () => "/api/v1",
}));

import { listPublishedProducts } from "./authored-queries";

afterEach(() => vi.unstubAllGlobals());
it("loads dashboard products from FastAPI without credentials or cached data", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ products: [] }));
  vi.stubGlobal("fetch", fetcher);
  expect(await listPublishedProducts("marine")).toEqual([]);
  expect(fetcher).toHaveBeenCalledWith(
    new URL("http://api.test/api/v1/wxproducts/public/products?kind=marine"),
    expect.objectContaining({ cache: "no-store" })
  );
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("headers");
});
it("reports an unavailable source instead of an empty feed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
  );
  await expect(listPublishedProducts()).rejects.toThrow(
    "Weather products unavailable"
  );
});
