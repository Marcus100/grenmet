import { describe, expect, it } from "vitest";
import { serviceIdFromQuery } from "./service-link";

const ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";

describe("serviceIdFromQuery", () => {
  it("accepts a well-formed id and lowercases it", () => {
    expect(serviceIdFromQuery(ID)).toBe(ID);
    expect(serviceIdFromQuery(ID.toUpperCase())).toBe(ID);
  });

  it.each([
    undefined,
    "",
    "nails",
    `${ID}x`,
    ` ${ID}`,
    "../../admin",
    `${ID}\n`,
    [ID, ID],
  ])("ignores %j", (value) => {
    expect(serviceIdFromQuery(value)).toBeUndefined();
  });
});
