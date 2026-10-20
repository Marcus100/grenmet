import { describe, expect, it } from "vitest";
import { friendlyConflict } from "./order-errors";

describe("friendlyConflict", () => {
  it("explains sold out tiers", () => {
    expect(friendlyConflict("VIP is sold out")).toBe(
      "VIP is sold out. Pick another ticket type or check back later."
    );
  });

  it("explains an organiser without online payment", () => {
    expect(
      friendlyConflict(
        "VIP is a paid ticket; online payment isn't available for this event"
      )
    ).toContain("can't take online payment");
  });

  it("explains that online-paid tickets are refunded by the organiser", () => {
    expect(
      friendlyConflict(
        "This ticket was paid online; ask the organiser for a refund"
      )
    ).toContain("organiser has to refund it");
  });

  it("explains a reused idempotency key and lost races", () => {
    expect(
      friendlyConflict(
        "This Idempotency-Key was already used for another order"
      )
    ).toContain("Reload the page");
    expect(
      friendlyConflict("Those tickets were just taken; please try again")
    ).toContain("Reload the page");
  });

  it("passes through limit messages and unknown text", () => {
    expect(
      friendlyConflict("You can hold up to 4 VIP tickets (you have 4)")
    ).toBe("You can hold up to 4 VIP tickets (you have 4)");
    expect(friendlyConflict(null)).toBeNull();
  });
});
