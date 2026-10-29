import { expect, it } from "vitest";
import { editorialLinksSchema } from "./editorial-links";

const PRODUCT = "0b3c6f1e-1111-4a2b-9c3d-222233334444";
const parse = (rows: unknown[]) => editorialLinksSchema.parse(rows);

it("accepts labelled existing destinations without needing upstream access", () => {
  expect(
    parse([
      {
        title: " Marine forecast ",
        category: "forecast",
        url: "https://weather.gd/marine",
      },
    ])[0]?.title
  ).toBe("Marine forecast");
  expect(parse([])).toEqual([]);
});
it.each([
  "javascript:alert(1)",
  "data:text/html,test",
  "//weather.gd/marine",
  "https://user:password@weather.gd",
])("rejects unsafe or ambiguous URL %s", (url) => {
  expect(editorialLinksSchema.safeParse([{ url }]).success).toBe(false);
});
it("accepts a blank title and category, to be filled in on save", () => {
  const [link] = parse([{ url: "https://example.test/report", title: " " }]);
  expect(link).toMatchObject({ title: "", category: "source", type: "link" });
});
it("rejects excessive links", () => {
  expect(
    editorialLinksSchema.safeParse(
      Array.from({ length: 21 }, (_, index) => ({
        url: `https://example.test/${index}`,
      }))
    ).success
  ).toBe(false);
});
it("rejects duplicate destinations, even pasted in different forms", () => {
  const link = { url: "https://example.test" };
  expect(editorialLinksSchema.safeParse([link, link]).success).toBe(false);
  expect(
    editorialLinksSchema.safeParse([
      { url: `https://weather.barrels.gd/weather/issued/${PRODUCT}` },
      { url: `/weather/issued/${PRODUCT}` },
    ]).success
  ).toBe(false);
});

it("works out what each pasted address points at", () => {
  const links = parse([
    { url: `https://weather.barrels.gd/weather/issued/${PRODUCT}` },
    { url: "https://weather.barrels.gd/alerts/GMS-2026-10-27-001" },
    { url: "/weather/radar" },
    { url: "https://www.metoffice.gov.uk/" },
  ]);
  expect(links.map((link) => [link.type, link.ref, link.category])).toEqual([
    ["product", PRODUCT, "forecast"],
    ["cap", "GMS-2026-10-27-001", "cap"],
    ["page", "/weather/radar", "article"],
    ["link", null, "source"],
  ]);
});

it("allows one main link, and only a GMS product, warning or page", () => {
  const product = {
    url: `/weather/issued/${PRODUCT}`,
    isMain: true,
  };
  expect(editorialLinksSchema.safeParse([product]).success).toBe(true);
  expect(
    editorialLinksSchema.safeParse([
      product,
      { url: "/weather/radar", isMain: true },
    ]).success
  ).toBe(false);
  expect(
    editorialLinksSchema.safeParse([
      { url: "https://example.test/", isMain: true },
    ]).success
  ).toBe(false);
});
