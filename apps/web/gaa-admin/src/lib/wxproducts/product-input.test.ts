import {
  emptyProduct,
  grenadaDate,
  ISSUE_TIMES,
  isCurrentProduct,
  localDateTime,
  type ProductKind,
  productFields,
  validateProduct,
} from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import {
  productInputSchema,
  validateProductInput,
} from "@/lib/wxproducts/product-input";

function complete(kind: ProductKind) {
  const values = emptyProduct(kind, "2026-09-08");
  for (const f of productFields(kind)) {
    if (!f.required || values[f.key]) continue;
    values[f.key] =
      f.options?.[0] ?? (f.type === "number" ? "25" : "Forecast detail");
  }
  values.issuedAt = "2026-09-08T18:00";
  values.validFrom = values.issuedAt;
  values.validTo = "2026-09-12T23:59";
  if (values.nextUpdate) values.nextUpdate = "2026-09-09T02:00";
  return values;
}
describe("authored product publication", () => {
  it.each([
    "morning",
    "midday",
    "evening",
    "outlook",
    "cyclone",
    "marine",
    "flood",
    "thunderstorm",
    "wind",
    "heat",
    "dust",
    "coastal",
    "tsunami",
  ] as const)("validates a complete %s product", (kind) => {
    expect(validateProduct({ kind, values: complete(kind) }, true)).toEqual([]);
  });
  it("allows incomplete drafts but rejects publication", () => {
    const content = {
      kind: "marine" as const,
      values: emptyProduct("marine", "2026-09-08"),
    };
    expect(validateProduct(content, false)).toEqual([]);
    expect(validateProduct(content, true)).toContain(
      "Bulletin: Synopsis is required"
    );
  });
  it("requires the fourth day, with consecutive dates, in an evening publication", () => {
    const values = complete("evening");
    expect(values.day4Date).toBe("2026-09-12");
    values.day4Weather = "";
    values.day3Date = "2026-09-12";
    const errors = validateProduct({ kind: "evening", values }, true);
    expect(errors).toContain("Day 4: Weather is required");
    expect(errors).toContain(
      "Day 3 must be 2026-09-11 (the following four days)"
    );
  });
  it("handles four-day outlooks across month and year boundaries", () => {
    expect(emptyProduct("evening", "2026-12-30").day4Date).toBe("2027-01-03");
  });
  it("records the specified local issue schedules", () => {
    expect(ISSUE_TIMES).toMatchObject({
      morning: ["07:00"],
      midday: ["12:00"],
      evening: ["18:00"],
      marine: ["05:00"],
      outlook: ["02:00", "08:00", "14:00", "20:00"],
    });
    const outlook = emptyProduct("outlook", "2026-09-08", "20:00");
    expect(outlook.issuedAt).toBe("2026-09-08T20:00");
    expect(outlook.nextUpdate).toBe("2026-09-09T02:00");
  });
  it("uses Grenada calendar dates around UTC midnight", () => {
    expect(grenadaDate(Date.parse("2026-09-09T02:00:00Z"))).toBe("2026-09-08");
    expect(localDateTime("2026-09-08T07:00")).toBe(
      Date.parse("2026-09-08T11:00:00Z")
    );
    expect(localDateTime("2026-02-30T07:00")).toBeNaN();
  });
  it("rejects impossible temperatures, invalid levels and reversed validity", () => {
    const values = complete("marine");
    values.level = "purple";
    values.validTo = values.validFrom;
    expect(validateProduct({ kind: "marine", values }, true)).toContain(
      "Colour level: select a listed option"
    );
    expect(validateProduct({ kind: "marine", values }, true)).toContain(
      "Validity must end after it starts"
    );
  });
  it("requires review, a revision note and an unexpired publication", () => {
    const input = productInputSchema.parse({
      id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
      expectedRevision: 1,
      kind: "marine",
      values: complete("marine"),
      action: "publish",
      changeSummary: "",
      reviewed: false,
    });
    const errors = validateProductInput(
      input,
      Date.parse("2026-09-14T00:00:00Z")
    );
    expect(errors).toContain("Review the preview before publishing");
    expect(errors).toContain("Describe this issue or revision");
    expect(errors).toContain("An expired product cannot be published");
  });
  it("rejects unknown types and fields at the write boundary", () => {
    expect(productInputSchema.safeParse({ kind: "__proto__" }).success).toBe(
      false
    );
    const input = productInputSchema.parse({
      id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
      expectedRevision: 0,
      kind: "marine",
      values: { forged: "value" },
      action: "draft",
      changeSummary: "",
      reviewed: false,
    });
    expect(validateProductInput(input)).toEqual(["Unknown product field"]);
  });
  it("excludes future and expired issues from the current feed", () => {
    const product = {
      id: "test",
      revision: 1,
      publishedAt: "2026-09-08T22:00:00Z",
      kind: "marine" as const,
      values: complete("marine"),
    };
    expect(isCurrentProduct(product, Date.parse("2026-09-08T21:59:00Z"))).toBe(
      false
    );
    expect(isCurrentProduct(product, Date.parse("2026-09-08T22:00:00Z"))).toBe(
      true
    );
    expect(
      isCurrentProduct(product, localDateTime(product.values.validTo))
    ).toBe(false);
  });
});
