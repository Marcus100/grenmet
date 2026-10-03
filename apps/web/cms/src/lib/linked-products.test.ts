import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  getEnv: () => ({ AUTH_API_URL: "https://api.test" }),
}));
vi.mock("./report-error", () => ({ reportError: vi.fn() }));

import { linkedProductsEndpoint, toOption } from "./linked-products";

const product = {
  id: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
  revision: 2,
  publishedAt: "2026-09-30T09:00:00Z",
  kind: "marine",
  values: { issuedAt: "2026-09-30T05:00", waves: "1.5–2.0 m" },
} as const;

describe("linked products", () => {
  it("labels a product by kind and issue time, never its figures", () => {
    expect(toOption(product)).toEqual({
      id: product.id,
      kind: "marine",
      label: "Marine · issued 2026-09-30 05:00",
    });
  });

  it("is for signed-in staff only", async () => {
    const response = await linkedProductsEndpoint({ user: null } as never);
    expect(response.status).toBe(401);
  });

  it("lists current FastAPI products for staff", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ products: [product] }));
    vi.stubGlobal("fetch", fetcher);
    const response = await linkedProductsEndpoint({ user: { id: 1 } } as never);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).products).toEqual([toOption(product)]);
    expect(
      String(fetcher.mock.calls[0][0].url ?? fetcher.mock.calls[0][0])
    ).toContain("/api/v1/wxproducts/public/products");
    vi.unstubAllGlobals();
  });

  it("says so when FastAPI is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await linkedProductsEndpoint({ user: { id: 1 } } as never);
    expect(response.status).toBe(503);
    vi.unstubAllGlobals();
  });
});
