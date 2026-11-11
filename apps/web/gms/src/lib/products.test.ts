import { emptyProduct, productFields } from "@barrelsgd/gms/products";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { AUTH_API_URL: "http://api.example.test", AUTH_API_V1_STR: "/api/v1" },
}));

import {
  fetchIssuedProducts,
  fetchMonthSummary,
  fetchPublicForecast,
  fetchPublishedProduct,
  fetchPublishedProducts,
  proxyProductPdf,
} from "@/lib/products";

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
      new URL(
        "http://api.example.test/api/v1/wxproducts/public/products?kind=marine"
      ),
      expect.objectContaining({ cache: "no-store" })
    );
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("headers");
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
  it("rejects malformed products and leaves validity decisions to FastAPI", async () => {
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
      products: [expired],
    });
  });
});

it("treats invalid forecast responses and outages as unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ periods: [] }))
  );
  expect(await fetchPublicForecast()).toBeNull();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
  );
  expect(await fetchPublicForecast()).toBeNull();
});

describe("one published product", () => {
  const id = "7d517fe0-a25b-4f12-a2b4-eaaed8116010";
  it("reads it by id, including whether it is still current", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ ...publication(), current: false }));
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchPublishedProduct(id);
    expect(result).toMatchObject({
      status: "ok",
      product: { id, current: false },
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `http://api.example.test/api/v1/wxproducts/public/products/${id}`
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
  });
  it("tells withdrawn apart from unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "x" }, { status: 404 }))
    );
    expect(await fetchPublishedProduct(id)).toEqual({ status: "not-found" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "x" }, { status: 503 }))
    );
    expect(await fetchPublishedProduct(id)).toEqual({ status: "unavailable" });
  });
  it("never requests a malformed id", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchPublishedProduct("../forecast")).toEqual({
      status: "not-found",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("month summary feed", () => {
  const summary = {
    station_id: "78958",
    month: "2026-09",
    period_start: "2026-09-01T00:00:00Z",
    period_end: "2026-09-08T12:00:00Z",
    last_observation_at: "2026-09-08T09:00:00Z",
    observation_count: 3,
    days_elapsed: 8,
    rain_report_days: 1,
    rainfall_mm: 4.2,
    rain_days: 1,
    rain_day_threshold_mm: 0.2,
    provisional: true,
  };
  it("reads the anonymous eregister endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ summary }));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchMonthSummary()).toMatchObject({ rainfall_mm: 4.2 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://api.example.test/api/v1/eregister/public/month-summary"
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
  });
  it("is null when empty, unavailable or off-contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ summary: null }))
    );
    expect(await fetchMonthSummary()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "x" }, { status: 503 }))
    );
    expect(await fetchMonthSummary()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ summary: { month: 1 } }))
    );
    expect(await fetchMonthSummary()).toBeNull();
  });
});

describe("issued products and their PDFs", () => {
  const ID = "7d517fe0-a25b-4f12-a2b4-eaaed8116010";

  it("reads recent issues with a limit and rejects a broken contract", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ products: [{ ...publication(), current: false }] })
      );
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchIssuedProducts(5);
    expect(result.status).toBe("ok");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://api.example.test/api/v1/wxproducts/public/issued-products?limit=5"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ products: [{ id: 1 }] }))
    );
    expect((await fetchIssuedProducts()).status).toBe("unavailable");
  });

  it("passes the PDF through with only its own headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("%PDF-1.7", {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'inline; filename="GMS.pdf"',
          "set-cookie": "nope=1",
        },
      })
    );
    vi.stubGlobal("fetch", fetcher);
    const response = await proxyProductPdf(ID);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-1.7");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="GMS.pdf"'
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `http://api.example.test/api/v1/wxproducts/public/products/${ID}/pdf`
    );
  });

  it("answers 404 for a malformed id without calling the API, and keeps upstream errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await proxyProductPdf("not-a-uuid")).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await proxyProductPdf(ID)).status).toBe(404);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect((await proxyProductPdf(ID)).status).toBe(503);
  });
});
