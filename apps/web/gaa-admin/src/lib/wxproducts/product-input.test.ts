import { readFileSync } from "node:fs";
import {
  emptyProduct,
  grenadaDate,
  ISSUE_TIMES,
  isCurrentProduct,
  isProductKind,
  localDateTime,
  PRODUCT_KINDS,
  type ProductKind,
  productFields,
} from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/lib/wxproducts/product-input";

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
describe("product presentation and transport", () => {
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
  it("leaves schedule normalization and publication rules to FastAPI", () => {
    const values = {
      issuedAt: "2026-09-08T13:00",
      validTo: "2026-09-08T14:00",
    };
    const parsed = productInputSchema.parse({
      id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
      expectedRevision: 0,
      kind: "morning",
      values,
      action: "draft",
      changeSummary: "",
      reviewed: false,
    });
    expect(parsed.values).toEqual(values);
    expect(
      productInputSchema.safeParse({ ...parsed, kind: "__proto__" }).success
    ).toBe(false);
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

it("keeps editor field definitions aligned with FastAPI publication rules", () => {
  const backend: unknown = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../api/fastapi/src/wxproducts/fields.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  const expected = Object.fromEntries(
    Object.keys(PRODUCT_KINDS).map((kind) => {
      if (!isProductKind(kind)) throw new Error("Unknown kind");
      return [
        kind,
        productFields(kind).map((field) => ({
          ...field,
          requiredOnPublish: !!field.required,
        })),
      ];
    })
  );
  expect(backend).toEqual(expected);
});
