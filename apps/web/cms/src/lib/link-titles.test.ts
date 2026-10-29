import { expect, it, vi } from "vitest";
import { editorialLinksSchema } from "./editorial-links";
import { checkLink, labelFor } from "./link-titles";

const BASE = "http://api.test";
const PRODUCT = "0b3c6f1e-1111-4a2b-9c3d-222233334444";
const link = (url: string) => {
  const [row] = editorialLinksSchema.parse([{ url }]);
  if (!row) throw new Error("expected a link");
  return row;
};
const reply = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });

it("names a product from its kind and issue time, and files it as forecast or bulletin", async () => {
  const fetcher = reply({
    kind: "evening",
    values: { issuedAt: "2026-10-27T18:00" },
  });
  expect(
    await labelFor(link(`/weather/issued/${PRODUCT}`), BASE, fetcher)
  ).toEqual({
    title: "Evening Forecast · issued 2026-10-27 18:00",
    category: "forecast",
  });
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(
    `${BASE}/api/v1/wxproducts/public/products/${PRODUCT}`
  );
  const bulletin = reply({ kind: "marine", values: {} });
  expect(
    await labelFor(link(`/weather/issued/${PRODUCT}`), BASE, bulletin)
  ).toEqual({ title: "Marine / Small Craft Bulletin", category: "bulletin" });
});

it("names a warning from its headline", async () => {
  const fetcher = reply({ info: [{ headline: "Heavy rain for St. George" }] });
  expect(await labelFor(link("/alerts/GMS-1"), BASE, fetcher)).toEqual({
    title: "Heavy rain for St. George",
    category: "cap",
  });
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(
    `${BASE}/api/cap/alerts/GMS-1`
  );
});

it("falls back to a plain label when the forecast system cannot be reached", async () => {
  const down = vi.fn().mockRejectedValue(new Error("offline"));
  expect(
    await labelFor(link(`/weather/issued/${PRODUCT}`), BASE, down)
  ).toEqual({
    title: "Issued product",
    category: "forecast",
  });
  expect(
    await labelFor(link("/alerts/GMS-1"), BASE, reply(null, false))
  ).toEqual({
    title: "CAP warning",
    category: "cap",
  });
});

it("names a site page from the menu and an outside link from its host", async () => {
  const fetcher = vi.fn();
  expect(await labelFor(link("/weather/radar"), BASE, fetcher)).toEqual({
    title: "Radar",
    category: "article",
  });
  expect(
    await labelFor(link("https://www.metoffice.gov.uk/x"), BASE, fetcher)
  ).toEqual({ title: "www.metoffice.gov.uk", category: "source" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("never requests a ref that is not a product UUID or CAP identifier", async () => {
  const fetcher = vi.fn();
  // The parser decodes %2F, so a warning link can carry a traversal ref.
  const traversal = link("/alerts/..%2Fx");
  expect(traversal.ref).toBe("../x");
  expect(await checkLink(traversal, BASE, fetcher)).toEqual({
    label: { title: "CAP warning", category: "cap" },
    state: "gone",
  });
  for (const ref of ["a/b", "%2e%2e", ".hidden", "x?y=1", "x y"]) {
    expect((await checkLink({ ...traversal, ref }, BASE, fetcher)).state).toBe(
      "gone"
    );
  }
  const forged = { ...link("/alerts/GMS-1"), type: "product" as const };
  for (const ref of ["../x", "not-a-uuid", `${PRODUCT}/..`]) {
    expect((await checkLink({ ...forged, ref }, BASE, fetcher)).state).toBe(
      "gone"
    );
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("accepts the CAP identifier forms the warning system issues", async () => {
  const fetcher = reply({ info: [{ headline: "Heavy rain" }] });
  for (const ref of [
    "urn:grenmet:cap:4f1e2d3c-1111-4a2b-9c3d-222233334444",
    "urn:oid:1.3.6.1.4.1.99:4f1e2d3c-1111-4a2b-9c3d-222233334444",
    "GMS-1",
  ]) {
    const url = `/alerts/${encodeURIComponent(ref)}`;
    expect((await checkLink(link(url), BASE, fetcher)).state).toBe("ok");
  }
  expect(fetcher).toHaveBeenCalledTimes(3);
});
