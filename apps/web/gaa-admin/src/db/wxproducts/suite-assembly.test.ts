import { describe, expect, it } from "vitest";
import { GMS_AGENCY } from "@/db/wxproducts/agency";
import { buildDailySuite } from "@/db/wxproducts/suite-assembly";

const ISSUED = new Date("2026-08-20T10:00:00Z");
const NEXT = new Date("2026-08-20T16:00:00Z");

describe("buildDailySuite", () => {
  it("identifies the suite and the day it covers", () => {
    const suite = buildDailySuite("GMS-DAILY-SUITE-2026-08-20", ISSUED, NEXT);
    expect(suite.suite_metadata.suite_id).toBe("GMS-DAILY-SUITE-2026-08-20");
    expect(suite.suite_metadata.suite_type).toBe("daily_product_suite");
    expect(suite.suite_metadata.suite_issue_datetime_utc).toBe(
      ISSUED.toISOString()
    );
  });

  it("publishes the service's own contact details, not a placeholder", () => {
    const suite = buildDailySuite("GMS-DAILY-SUITE-2026-08-20", ISSUED, NEXT);
    expect(suite.suite_metadata.issuing_agency).toEqual(GMS_AGENCY);
    expect(suite.suite_metadata.issuing_agency.contacts.email).toBe(
      "meteorology@gaa.gd"
    );
  });

  it("starts empty, because products live in their own tables", () => {
    expect(
      buildDailySuite("GMS-DAILY-SUITE-2026-08-20", ISSUED, NEXT).products
    ).toEqual([]);
  });

  it("advertises every product type the service issues", () => {
    const types = buildDailySuite(
      "GMS-DAILY-SUITE-2026-08-20",
      ISSUED,
      NEXT
    ).catalog.product_types_supported.map((p) => p.product_type);
    expect(types).toEqual([
      "morning_forecast",
      "midday_weather_report",
      "evening_forecast",
      "marine_bulletin",
      "tropical_weather_outlook",
    ]);
  });

  it("records when the next product is due", () => {
    const suite = buildDailySuite("GMS-DAILY-SUITE-2026-08-20", ISSUED, NEXT);
    expect(suite.suite_metadata.update_policy.next_update_time_utc).toBe(
      NEXT.toISOString()
    );
  });
});
