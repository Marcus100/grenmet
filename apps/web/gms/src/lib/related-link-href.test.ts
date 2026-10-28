import { expect, it } from "vitest";
import { isOutsideLink, relatedLinkHref } from "@/lib/related-link-href";

it("builds GMS addresses from the id, identifier or path", () => {
  expect(
    relatedLinkHref({
      type: "product",
      ref: "abc",
      url: "http://localhost:3003/x",
    })
  ).toBe("/weather/issued/abc");
  expect(
    relatedLinkHref({ type: "cap", ref: "urn:oid:1.2", url: "/alerts/x" })
  ).toBe("/alerts/urn%3Aoid%3A1.2");
  expect(
    relatedLinkHref({ type: "page", ref: "/weather/radar", url: "/y" })
  ).toBe("/weather/radar");
  expect(
    relatedLinkHref({ type: "link", ref: null, url: "https://example.test/" })
  ).toBe("https://example.test/");
  expect(isOutsideLink({ type: "link" })).toBe(true);
  expect(isOutsideLink({ type: "page" })).toBe(false);
});
