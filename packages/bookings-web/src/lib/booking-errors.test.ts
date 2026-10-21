import { describe, expect, it } from "vitest";
import { classifyFailure, detailOf } from "./booking-errors";

const SLOT = "That time is no longer available. Please choose another.";
const CUTOFF =
  "Bookings can be changed online up to 24 hours before they start. Please contact the studio.";

describe("booking-errors", () => {
  it("tells a taken slot from the cutoff", () => {
    expect(classifyFailure(409, SLOT, "create").code).toBe("slot_taken");
    expect(classifyFailure(409, SLOT, "reschedule").code).toBe("slot_taken");
    const cutoff = classifyFailure(409, CUTOFF, "cancel");
    expect(cutoff.code).toBe("cutoff");
    expect(cutoff.message).toBe(CUTOFF);
  });

  it("explains a key reused with another body", () => {
    expect(classifyFailure(409, "Idempotency key reused", "create").code).toBe(
      "conflict"
    );
  });

  it("maps the other statuses", () => {
    expect(classifyFailure(404, undefined, "read").code).toBe("not_found");
    expect(classifyFailure(429, undefined, "create").code).toBe("rate_limited");
    expect(classifyFailure(403, undefined, "create").code).toBe("verification");
    expect(classifyFailure(422, undefined, "create").code).toBe("invalid");
    expect(classifyFailure(503, undefined, "create").code).toBe("unavailable");
  });

  it("names the studio's manual channel when one is given", () => {
    expect(classifyFailure(503, undefined, "create", "Instagram").message).toBe(
      "Booking is unavailable right now. Please try again shortly, or message us on Instagram."
    );
    expect(classifyFailure(503, undefined, "create").message).toBe(
      "Booking is unavailable right now. Please try again shortly."
    );
  });

  it("reads the API's detail text only when it is a string", () => {
    expect(detailOf({ detail: "x" })).toBe("x");
    expect(detailOf({ detail: [{ msg: "x" }] })).toBeUndefined();
    expect(detailOf(null)).toBeUndefined();
  });
});
