import { describe, expect, it } from "vitest";
import { isCompleteScanList } from "@/organiser/analytics-api";

const HEADER = "time,gate,printed_number,outcome,entry,offline";
const ROW = "2026-12-26T19:01:00-04:00,Main gate,205,admitted,scanned,no";

describe("isCompleteScanList", () => {
  it("accepts a header, rows and a matching end line", () => {
    expect(
      isCompleteScanList(`${HEADER}\r\n${ROW}\r\n${ROW}\r\n# end,2 rows\r\n`)
    ).toBe(true);
    expect(isCompleteScanList(`${HEADER}\r\n# end,0 rows\r\n`)).toBe(true);
  });

  it("refuses a list with no end line", () => {
    expect(isCompleteScanList(`${HEADER}\r\n${ROW}\r\n`)).toBe(false);
    expect(isCompleteScanList(`${HEADER}\r\n${ROW}`)).toBe(false);
    expect(isCompleteScanList("")).toBe(false);
  });

  it("refuses an end line that counts a different number of rows", () => {
    expect(isCompleteScanList(`${HEADER}\r\n${ROW}\r\n# end,2 rows\r\n`)).toBe(
      false
    );
    expect(
      isCompleteScanList(`${HEADER}\r\n${ROW}\r\n${ROW}\r\n# end,1 rows\r\n`)
    ).toBe(false);
  });

  it("refuses an end line cut in the middle", () => {
    expect(isCompleteScanList(`${HEADER}\r\n${ROW}\r\n# end,1 ro`)).toBe(false);
  });
});
