import { describe, expect, it } from "vitest";
import { parseAuditQuery } from "./audit-query";

const ALERT = "11111111-2222-4333-8444-555555555555";

describe("parseAuditQuery", () => {
  it("defaults to page 1 with no alert filter", () => {
    expect(parseAuditQuery({})).toEqual({ alertId: null, ok: true, page: 1 });
  });

  it("accepts a whole page number and a full alert id", () => {
    expect(parseAuditQuery({ alert_id: ALERT, page: "3" })).toEqual({
      alertId: ALERT,
      ok: true,
      page: 3,
    });
  });

  it("lower-cases an upper-case alert id before it is used", () => {
    const result = parseAuditQuery({ alert_id: ALERT.toUpperCase() });
    expect(result).toEqual({ alertId: ALERT, ok: true, page: 1 });
  });

  it.each([["0"], ["-1"], ["2.5"], ["1e3"], ["abc"], [" 2 0"], ["99999999"]])(
    "refuses the page value %j",
    (page) => {
      const result = parseAuditQuery({ page });
      expect(result.ok).toBe(false);
    }
  );

  it("refuses a repeated page parameter rather than picking one", () => {
    expect(parseAuditQuery({ page: ["1", "2"] }).ok).toBe(false);
  });

  it.each([
    ["../../etc"],
    [`${ALERT}/extra`],
    ["11111111-2222-4333-8444"],
    [`${ALERT}%2e`],
  ])("refuses the alert id %j", (alert_id) => {
    expect(parseAuditQuery({ alert_id }).ok).toBe(false);
  });
});
