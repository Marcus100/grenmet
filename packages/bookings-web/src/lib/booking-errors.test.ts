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

  it("maps the emailed-code request failures", () => {
    const code = (status: number) =>
      classifyFailure(status, undefined, "email-code", "Instagram");
    expect(code(429).code).toBe("code_limited");
    expect(code(503).code).toBe("code_unavailable");
    expect(code(404).code).toBe("not_found");
    expect(code(422).code).toBe("invalid");
    expect(code(400).code).toBe("verification");
    const failed = code(502);
    expect(failed.code).toBe("code_send_failed");
    expect(failed.message).toContain("not yours");
    expect(failed.message).toContain("Instagram");
    expect(code(500).code).toBe("code_send_failed");
  });

  it("maps the code confirmation failures, naming when to retry a lockout", () => {
    const confirm = (status: number) =>
      classifyFailure(status, undefined, "email-confirm");
    expect(confirm(400).code).toBe("code_rejected");
    expect(confirm(400).message).toContain("expired");
    const locked = confirm(429);
    expect(locked.code).toBe("code_locked");
    expect(locked.message).toContain("15 minutes");
    expect(confirm(503).code).toBe("code_unavailable");
    expect(confirm(500).code).toBe("code_unavailable");
    expect(confirm(404).code).toBe("not_found");
  });

  it("tells a missing email proof from a failed human check on create", () => {
    const missing = classifyFailure(
      403,
      "email_verification_required: pay a deposit needs a verified email",
      "create"
    );
    expect(missing.code).toBe("email_unverified");
    expect(missing.message).toContain("new code");
    expect(classifyFailure(403, "Turnstile failed", "create").code).toBe(
      "verification"
    );
  });

  it("reads the API's detail text only when it is a string", () => {
    expect(detailOf({ detail: "x" })).toBe("x");
    expect(detailOf({ detail: [{ msg: "x" }] })).toBeUndefined();
    expect(detailOf(null)).toBeUndefined();
  });
});
