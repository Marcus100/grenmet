import { describe, expect, it } from "vitest";
import { parseSubscription } from "./subscribe";

describe("parseSubscription", () => {
  it("rejects an invalid email", () => {
    const result = parseSubscription({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const result = parseSubscription({ whatsapp: "+1473 555 1234" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid email with no WhatsApp number", () => {
    const result = parseSubscription({ email: "reader@example.gd" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("reader@example.gd");
      expect(result.data.whatsapp).toBeUndefined();
    }
  });

  it("accepts a valid email with a WhatsApp number", () => {
    const result = parseSubscription({
      email: "reader@example.gd",
      whatsapp: "+1473 555 1234",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.whatsapp).toBe("+1473 555 1234");
    }
  });
});
