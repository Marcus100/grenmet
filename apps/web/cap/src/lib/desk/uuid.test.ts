import { describe, expect, it } from "vitest";
import { parseUuid } from "./uuid";

const ID = "11111111-2222-4333-8444-555555555555";

describe("parseUuid", () => {
  it("accepts a full id and lower-cases it", () => {
    expect(parseUuid(ID.toUpperCase())).toBe(ID);
  });

  it.each([
    [`${ID}/..`],
    [`${ID}/extra`],
    [`${ID}%2e%2e`],
    ["..%2f..%2fetc"],
    ["11111111-2222-4333-8444"],
    [` ${ID}`],
    [""],
  ])("refuses %j", (value) => {
    expect(parseUuid(value)).toBeNull();
  });

  it("refuses values that are not strings", () => {
    expect(parseUuid(["x"])).toBeNull();
    expect(parseUuid(null)).toBeNull();
  });
});
