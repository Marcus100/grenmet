import { ResponseError } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { failureFrom } from "./booking-errors";

const SLOT = "That time is no longer available. Please choose another.";

function apiError(status: number, detail?: string) {
  return new ResponseError({
    data: detail ? { detail } : undefined,
    status,
    statusText: "",
    request: new Request("http://api.test/x"),
    response: new Response(null, { status }),
  });
}

describe("failureFrom", () => {
  it("turns API errors into failures", () => {
    expect(failureFrom(apiError(409, SLOT), "create").code).toBe("slot_taken");
    expect(failureFrom(apiError(404), "read").code).toBe("not_found");
  });

  it("rethrows everything that is not an API response", () => {
    expect(() => failureFrom(new TypeError("fetch failed"), "create")).toThrow(
      "fetch failed"
    );
  });
});
