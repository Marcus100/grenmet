import { describe, expect, it } from "vitest";
import { describeDeskError } from "./errors";

const PATTERN_1 = /Not published/;
const PATTERN_2 = /may or may not have gone through/;

function failure(status: number, detail: unknown) {
  return Object.assign(new Error("failed"), {
    data: { detail },
    name: "ResponseError",
    status,
  });
}

describe("describeDeskError", () => {
  it("lists every CAP 1.2 schema problem from a refused publish", () => {
    const result = describeDeskError(
      failure(
        422,
        "CAP XML does not conform to the official CAP 1.2 schema: line 3: bad sent; line 9: missing area"
      )
    );
    expect(result.kind).toBe("schema");
    expect(result.title).toMatch(PATTERN_1);
    expect(result.items).toEqual(["line 3: bad sent", "line 9: missing area"]);
  });

  it("lists CAP check failures one by one", () => {
    const result = describeDeskError(
      failure(422, "Validation failed: Expires is in the past; No area")
    );
    expect(result.kind).toBe("validation");
    expect(result.items).toEqual(["Expires is in the past", "No area"]);
  });

  it("names the field for request validation errors", () => {
    const result = describeDeskError(
      failure(422, [
        { loc: ["body", "info", 0, "web"], msg: "web must be one address" },
      ])
    );
    expect(result.items).toEqual(["info › 0 › web: web must be one address"]);
  });

  it("explains the imported-alert confirmation", () => {
    const result = describeDeskError(
      failure(409, "This alert was imported. ... confirm_imported set to true.")
    );
    expect(result.kind).toBe("imported-confirm");
  });

  it("separates session, permission, state and outage", () => {
    expect(describeDeskError(failure(401, "x")).kind).toBe("session");
    expect(describeDeskError(failure(403, "x")).kind).toBe("not-allowed");
    expect(describeDeskError(failure(409, "Only a published")).kind).toBe(
      "state"
    );
    const outage = describeDeskError(new TypeError("fetch failed"));
    expect(outage.kind).toBe("unavailable");
    expect(outage.title).toMatch(PATTERN_2);
  });
});
