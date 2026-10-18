import type { PublicMonthSummary } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { monthStats } from "@/lib/month-summary";

const summary: PublicMonthSummary = {
  station_id: "78958",
  station_name: "MBIA",
  month: "2026-09",
  period_start: "2026-09-01T00:00:00Z",
  period_end: "2026-10-01T00:00:00Z",
  last_observation_at: "2026-09-30T12:00:00Z",
  observation_count: 30,
  days_elapsed: 30,
  rain_report_days: 28,
  rainfall_mm: 140.5,
  rain_days: 1,
  rain_day_threshold_mm: 0.2,
  max_temperature_c: 32,
  max_temperature_at: "2026-09-03T12:00:00Z",
  min_temperature_c: 23.8,
  min_temperature_at: "2026-09-06T12:00:00Z",
  provisional: false,
};

describe("monthStats", () => {
  it("maps the summary to four cards and labels the period", () => {
    const { caption, stats } = monthStats(summary);
    expect(caption).toBe("Month to date · MBIA · to 30 September");
    expect(stats.map((s) => [s.value, s.unit, s.detail])).toEqual([
      ["140.5", "mm", "28 of 30 days reported"],
      ["32.0", "°C", "on 3 September"],
      ["23.8", "°C", "on 6 September"],
      ["1", "day", "with 0.2 mm or more"],
    ]);
  });

  it("labels provisional figures", () => {
    expect(monthStats({ ...summary, provisional: true }).caption).toContain(
      "provisional"
    );
  });

  it("keeps unreported figures null instead of zero", () => {
    const { stats } = monthStats({
      ...summary,
      rainfall_mm: null,
      rain_days: null,
      max_temperature_c: null,
      max_temperature_at: null,
      min_temperature_c: null,
      min_temperature_at: null,
    });
    expect(stats.map((s) => s.value)).toEqual([null, null, null, null]);
    expect(stats[1]?.detail).toBe("Not reported yet");
  });

  it("keeps a real zero rainfall", () => {
    const { stats } = monthStats({ ...summary, rainfall_mm: 0, rain_days: 0 });
    expect(stats[0]?.value).toBe("0");
    expect(stats[3]?.value).toBe("0");
  });
});
