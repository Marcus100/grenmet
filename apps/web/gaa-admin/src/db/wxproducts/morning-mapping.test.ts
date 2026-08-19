import { describe, expect, it } from "vitest";
import { gmsMorningForecastExample } from "@/data/wxproducts/gms-morning-forecast.example";
import {
  fromMorningRows,
  toMorningRows,
} from "@/db/wxproducts/morning-mapping";

const SUITE = "gms-daily-2026-08-19";

describe("toMorningRows", () => {
  it("carries the public product id and type onto the parent row", () => {
    const rows = toMorningRows(gmsMorningForecastExample, SUITE);
    expect(rows.product.productId).toBe(
      gmsMorningForecastExample.product_metadata.product_id
    );
    expect(rows.product.productType).toBe(
      gmsMorningForecastExample.product_metadata.product_type
    );
    expect(rows.product.suiteId).toBe(SUITE);
  });

  it("parses the issue time into a Date the column can store", () => {
    const rows = toMorningRows(gmsMorningForecastExample, SUITE);
    expect(rows.product.issueDatetimeUtc).toBeInstanceOf(Date);
    expect(rows.product.issueDatetimeUtc?.toISOString()).toBe(
      new Date(
        gmsMorningForecastExample.product_metadata.issue_datetime_utc
      ).toISOString()
    );
  });

  it("stores null rather than an invalid date when the issue time is unparseable", () => {
    const rows = toMorningRows(
      {
        ...gmsMorningForecastExample,
        product_metadata: {
          ...gmsMorningForecastExample.product_metadata,
          issue_datetime_utc: "not a date",
        },
      },
      SUITE
    );
    expect(rows.product.issueDatetimeUtc).toBeNull();
  });

  it("keeps the headline and elements on the detail row", () => {
    const rows = toMorningRows(gmsMorningForecastExample, SUITE);
    expect(rows.detail.headline).toBe(
      gmsMorningForecastExample.forecast.headline
    );
    expect(rows.detail.elements).toEqual(
      gmsMorningForecastExample.forecast.elements
    );
  });

  it("uses null, not an empty array, when there are no advisories", () => {
    const rows = toMorningRows(
      {
        ...gmsMorningForecastExample,
        forecast: {
          ...gmsMorningForecastExample.forecast,
          product_notes: null,
        },
      },
      SUITE
    );
    expect(rows.detail.productNotesAdvisories).toBeNull();
  });
});

describe("fromMorningRows", () => {
  it("round-trips a product without losing the advisories", () => {
    const withAdvisories = {
      ...gmsMorningForecastExample,
      forecast: {
        ...gmsMorningForecastExample.forecast,
        product_notes: { advisories_text: ["Small craft should stay in port"] },
      },
    };
    const rows = toMorningRows(withAdvisories, SUITE);
    const restored = fromMorningRows({
      detail: rows.detail,
      links: rows.product.links,
      metadata: rows.product.metadata,
    });
    expect(restored?.forecast.product_notes?.advisories_text).toEqual([
      "Small craft should stay in port",
    ]);
    expect(restored?.forecast.headline).toBe(withAdvisories.forecast.headline);
    expect(restored?.product_metadata).toEqual(withAdvisories.product_metadata);
  });

  it("returns null when the stored metadata is missing", () => {
    const rows = toMorningRows(gmsMorningForecastExample, SUITE);
    expect(
      fromMorningRows({
        detail: rows.detail,
        links: rows.product.links,
        metadata: null,
      })
    ).toBeNull();
  });
});
