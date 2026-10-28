import { expect, it, vi } from "vitest";
import { editorialLinksSchema } from "./editorial-links";
import { labelFor } from "./link-titles";

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
