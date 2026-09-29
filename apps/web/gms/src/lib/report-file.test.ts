import { describe, expect, it } from "vitest";
import { fileLabel, reportPeriod } from "./report-file";

describe("report file labels", () => {
  it("names the type and a readable size", () => {
    expect(fileLabel({ filename: "aug.pdf", filesize: 1_234_567 })).toBe(
      "PDF, 1.2 MB"
    );
    expect(fileLabel({ filename: "rain.csv", filesize: 300 })).toBe(
      "CSV, 1 KB"
    );
    expect(fileLabel({ filename: "data.xlsx", filesize: null })).toBe("XLSX");
  });
  it("gives the period in Grenada dates", () => {
    expect(reportPeriod("2026-08-01T12:00:00Z", "2026-08-31T12:00:00Z")).toBe(
      "1 August 2026 to 31 August 2026"
    );
    expect(reportPeriod(null, "2026-08-31T12:00:00Z")).toBe("31 August 2026");
  });
});
