import { emptyProduct, productFields } from "@barrelsgd/gms/products";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { WXPRODUCTS_API_URL: "http://admin.example.test" },
}));

import { fetchPublishedProducts } from "@/lib/products";

function publication() {
  const values = emptyProduct("marine", "2026-09-08");
  for (const field of productFields("marine"))
    if (field.required && !values[field.key])
      values[field.key] = field.options?.[0] ?? "Details";
  values.validTo = "2026-09-09T05:00";
  return {
    id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
    kind: "marine",
    revision: 1,
    publishedAt: "2026-09-08T09:00:00Z",
    values,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("public product feed", () => {
  it("fetches only public data without cookies and bypasses stale caches", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ products: [publication()] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchPublishedProducts("marine");
    expect(result.status).toBe("ok");
    expect(result.products).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("http://admin.example.test/api/public/products?kind=marine"),
      expect.objectContaining({ cache: "no-store" })
    );
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("headers");
  });
  it("distinguishes a service outage from an empty feed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "offline" }, { status: 503 }))
    );
    expect((await fetchPublishedProducts()).status).toBe("unavailable");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ products: [] }))
    );
    expect(await fetchPublishedProducts()).toEqual({
      status: "ok",
      products: [],
    });
  });
  it("rejects malformed products and filters expired snapshots", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ products: [{ kind: "marine", values: {} }] })
        )
    );
    expect((await fetchPublishedProducts()).status).toBe("unavailable");
    const expired = publication();
    expired.values.validTo = "2026-09-08T06:00";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ products: [expired] }))
    );
    expect(await fetchPublishedProducts()).toEqual({
      status: "ok",
      products: [],
    });
  });
});
