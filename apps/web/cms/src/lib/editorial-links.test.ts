import { expect, it } from "vitest";
import { editorialLinksSchema } from "./editorial-links";

it("accepts labelled existing destinations without needing upstream access", () => {
  expect(
    editorialLinksSchema.parse([
      {
        title: " Marine forecast ",
        category: "forecast",
        url: "https://weather.gd/marine",
      },
    ])[0]?.title
  ).toBe("Marine forecast");
  expect(editorialLinksSchema.parse([])).toEqual([]);
});
it.each([
  "javascript:alert(1)",
  "data:text/html,test",
  "//weather.gd/marine",
  "https://user:password@weather.gd",
  "/marine",
])("rejects unsafe or ambiguous URL %s", (url) => {
  expect(
    editorialLinksSchema.safeParse([{ title: "Link", category: "source", url }])
      .success
  ).toBe(false);
});
it("rejects missing titles and excessive links", () => {
  const link = { title: " ", category: "source", url: "https://example.test" };
  expect(editorialLinksSchema.safeParse([link]).success).toBe(false);
  expect(
    editorialLinksSchema.safeParse(
      Array.from({ length: 21 }, () => ({ ...link, title: "Source" }))
    ).success
  ).toBe(false);
});
it("rejects duplicate destinations", () => {
  const link = {
    title: "Source",
    category: "source",
    url: "https://example.test",
  };
  expect(editorialLinksSchema.safeParse([link, link]).success).toBe(false);
});
