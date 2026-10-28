import { describe, expect, it } from "vitest";
import { parseScannedTicket } from "./door-scan";

describe("parseScannedTicket", () => {
  it("accepts a signed token and a bare code, trimmed", () => {
    expect(parseScannedTicket(" BT1.ABCDEFGHJK.abcdEFGH12345678 ")).toBe(
      "BT1.ABCDEFGHJK.abcdEFGH12345678"
    );
    expect(parseScannedTicket("ABCDE-FGHJK")).toBe("ABCDE-FGHJK");
    expect(parseScannedTicket("abcdefghjk")).toBe("abcdefghjk");
  });

  it("refuses anything else", () => {
    expect(parseScannedTicket("https://example.com/x")).toBeNull();
    expect(parseScannedTicket("")).toBeNull();
    expect(parseScannedTicket("BT1.short")).toBeNull();
    expect(parseScannedTicket("A".repeat(500))).toBeNull();
  });
});
