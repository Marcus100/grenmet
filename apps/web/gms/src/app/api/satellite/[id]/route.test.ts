// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/satellite/[id]/route";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/products", () => ({
  endpoint: (path: string, domain: string) =>
    new URL(`http://api.test/api/v1/${domain}/public/${path}`),
}));

const call = (id: string) =>
  GET(new Request(`http://site.test/api/satellite/${id}`), {
    params: Promise.resolve({ id }),
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("satellite image proxy", () => {
  it("rejects ids that are not plain numbers without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call("../secret")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes an image through with storm cache headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("png", {
            headers: { "content-type": "image/png" },
          })
      )
    );
    const response = await call("12");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("stale-if-error");
  });

  it("refuses non-image bytes and never caches failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>", { headers: { "content-type": "text/html" } })
      )
    );
    const response = await call("12");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
