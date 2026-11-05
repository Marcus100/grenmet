import { describe, expect, it } from "vitest";
import {
  CONTACT_SITE_KEY,
  contactSchema,
  firstContactError,
  parseContact,
} from "@/lib/contact";

const valid = {
  name: "Jane Traveller",
  email: "jane@example.com",
  subject: "General enquiry",
  message: "When does the Executive Lounge open on Sundays?",
};

describe("contactSchema", () => {
  it("accepts a valid submission", () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      contactSchema.safeParse({ ...valid, email: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects an unknown subject", () => {
    expect(
      contactSchema.safeParse({ ...valid, subject: "Hacking" }).success
    ).toBe(false);
  });

  it("rejects a too-short message", () => {
    expect(contactSchema.safeParse({ ...valid, message: "hi" }).success).toBe(
      false
    );
  });

  it("trims whitespace before validating", () => {
    const parsed = parseContact({ ...valid, name: "  Jane  " });
    expect(parsed.success && parsed.data.name).toBe("Jane");
  });

  it("treats a whitespace-only name as too short", () => {
    const parsed = parseContact({ ...valid, name: "   " });
    expect(parsed.success).toBe(false);
    expect(parsed.success || firstContactError(parsed.error)).toBe(
      "Please enter your name"
    );
  });

  it("keeps the Turnstile token under the browser's camelCase name", () => {
    const parsed = parseContact({ ...valid, turnstileToken: "tok-1" });
    expect(parsed.success && parsed.data.turnstileToken).toBe("tok-1");
  });

  it("targets the mbia site key", () => {
    expect(CONTACT_SITE_KEY).toBe("mbia");
  });

  it("explains the first failing field", () => {
    const parsed = parseContact({ ...valid, email: "nope" });
    expect(parsed.success).toBe(false);
    expect(parsed.success || firstContactError(parsed.error)).toBe(
      "Please enter a valid email address"
    );
  });

  it("asks for a shorter message when it is too long", () => {
    const parsed = parseContact({ ...valid, message: "x".repeat(4001) });
    expect(parsed.success || firstContactError(parsed.error)).toBe(
      "That is too long. Please shorten it."
    );
  });
});
