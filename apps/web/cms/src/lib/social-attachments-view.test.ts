import { describe, expect, it } from "vitest";
import { attachmentsView, mainLinkUrl } from "../lib/social-attachments-view";

const row = (index: number, url: string, isMain: boolean) => ({
  [`relatedLinks.${index}.url`]: { value: url },
  [`relatedLinks.${index}.isMain`]: { value: isMain },
});
const PRODUCT = "/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444";

describe("mainLinkUrl", () => {
  it("reads the row marked main, wherever it is", () => {
    expect(
      mainLinkUrl({
        ...row(0, "/weather/radar", false),
        ...row(1, "/alerts/GMS-1", true),
      })
    ).toBe("/alerts/GMS-1");
    expect(mainLinkUrl(row(0, "/weather/radar", false))).toBeNull();
    expect(mainLinkUrl(row(0, "  ", true))).toBeNull();
    expect(mainLinkUrl({})).toBeNull();
  });
});

describe("attachmentsView", () => {
  it("offers downloads for a main warning, including one pasted from another host", () => {
    expect(
      attachmentsView(row(0, "https://weather.barrels.gd/alerts/GMS-1", true))
    ).toEqual({ kind: "downloads", identifier: "GMS-1" });
    expect(attachmentsView(row(0, "/alerts/urn%3Aoid%3A1.2", true))).toEqual({
      kind: "downloads",
      identifier: "urn:oid:1.2",
    });
  });
  it("says product images are not made yet, and otherwise asks for a main warning", () => {
    expect(attachmentsView(row(0, PRODUCT, true))).toEqual({ kind: "product" });
    expect(attachmentsView(row(0, "/weather/radar", true))).toEqual({
      kind: "none",
    });
    expect(attachmentsView(row(0, "/alerts/GMS-1", false))).toEqual({
      kind: "none",
    });
    expect(attachmentsView({})).toEqual({ kind: "none" });
  });
});
