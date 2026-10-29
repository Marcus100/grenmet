import { recognizeLink, sitePath } from "@barrelsgd/gms/link-recognition";
import { describe, expect, it } from "vitest";

const PRODUCT = "0b3c6f1e-1111-4a2b-9c3d-222233334444";

describe("recognizeLink", () => {
  it.each([
    [
      `https://weather.barrels.gd/weather/issued/${PRODUCT}`,
      "product",
      PRODUCT,
    ],
    [
      `https://weather.staging.barrels.gd/weather/issued/${PRODUCT}/`,
      "product",
      PRODUCT,
    ],
    [
      `http://localhost:3003/weather/issued/${PRODUCT.toUpperCase()}?x=1`,
      "product",
      PRODUCT,
    ],
    [`/weather/issued/${PRODUCT}`, "product", PRODUCT],
    [
      "https://weather.barrels.gd/alerts/GMS-2026-10-27-001",
      "cap",
      "GMS-2026-10-27-001",
    ],
    [
      "/alerts/urn%3Aoid%3A2.49.0.1.308.0.2026.1",
      "cap",
      "urn:oid:2.49.0.1.308.0.2026.1",
    ],
    ["https://weather.barrels.gd/weather/radar", "page", "/weather/radar"],
    ["/weather/radar#top", "page", "/weather/radar"],
    // A page in the menu wins over the warning pattern.
    ["/alerts/advisories", "page", "/alerts/advisories"],
    // A page outside the menu (a dated forecast day) is still a site page.
    ["/weather/2026/10/28", "page", "/weather/2026/10/28"],
    ["https://www.metoffice.gov.uk/", "link", null],
    ["https://weather.barrels.gd.evil.test/alerts/x", "link", null],
    ["//weather.barrels.gd/alerts/x", "link", null],
    ["/alerts/%E0%A4%A", "link", null],
  ])("%s", (input, type, ref) => {
    expect(recognizeLink(input)).toEqual({ type, ref });
  });
  it("a non-UUID issued path is just a page", () => {
    expect(recognizeLink("/weather/issued/not-an-id").type).toBe("page");
  });
});

describe("sitePath", () => {
  it("returns the path of a GMS address and null for anything else", () => {
    expect(sitePath(" https://weather.gd/marine/tides/?a=1 ")).toBe(
      "/marine/tides"
    );
    expect(sitePath("/")).toBe("/");
    expect(sitePath("https://example.test/marine")).toBeNull();
  });
});
