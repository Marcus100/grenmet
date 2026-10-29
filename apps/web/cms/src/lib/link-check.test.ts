import { describe, expect, it, vi } from "vitest";
import { editorialLinksSchema } from "./editorial-links";
import { checkLink } from "./link-titles";

const BASE = "http://api.test";
const PRODUCT = "0b3c6f1e-1111-4a2b-9c3d-222233334444";
const link = (url: string) => {
  const [row] = editorialLinksSchema.parse([{ url }]);
  if (!row) throw new Error("expected a link");
  return row;
};
const answer = (status: number, body: unknown = null) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });

describe("whether a related link still works", () => {
  it("is ok for an issued product that is on the feed", async () => {
    const result = await checkLink(
      link(`/weather/issued/${PRODUCT}`),
      BASE,
      answer(200, { kind: "morning", values: { issuedAt: "2026-10-28T07:00" } })
    );
    expect(result.state).toBe("ok");
  });
  it("is gone for a product the feed answers 404 for (withdrawn or never issued)", async () => {
    const result = await checkLink(
      link(`/weather/issued/${PRODUCT}`),
      BASE,
      answer(404, { error: "Product not found" })
    );
    expect(result).toEqual({
      state: "gone",
      label: { title: "Issued product", category: "forecast" },
    });
  });
  it("is gone for a warning the public record answers 404 for", async () => {
    const result = await checkLink(link("/alerts/GMS-1"), BASE, answer(404));
    expect(result.state).toBe("gone");
  });
  it("is unknown, not broken, when the forecast system fails", async () => {
    expect(
      (await checkLink(link(`/weather/issued/${PRODUCT}`), BASE, answer(503)))
        .state
    ).toBe("unknown");
    const offline = vi.fn().mockRejectedValue(new Error("offline"));
    expect((await checkLink(link("/alerts/GMS-1"), BASE, offline)).state).toBe(
      "unknown"
    );
  });
  it("is ok for a warning on the public record", async () => {
    const result = await checkLink(
      link("/alerts/GMS-1"),
      BASE,
      answer(200, { info: [{ headline: "Heavy rain" }] })
    );
    expect(result).toEqual({
      state: "ok",
      label: { title: "Heavy rain", category: "cap" },
    });
  });
  it("is gone for a GMS page that no longer exists, and ok for one that does", async () => {
    const fetcher = answer(200);
    expect(
      (await checkLink(link("/weather/satellite"), BASE, fetcher)).state
    ).toBe("ok");
    expect(
      (await checkLink(link("/weather/no-such-page"), BASE, fetcher)).state
    ).toBe("gone");
    // The page check is local, so the forecast system is never asked.
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never asks about an outside link", async () => {
    const fetcher = answer(200);
    expect(
      await checkLink(link("https://example.test/report"), BASE, fetcher)
    ).toEqual({
      state: "ok",
      label: { title: "example.test", category: "source" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
