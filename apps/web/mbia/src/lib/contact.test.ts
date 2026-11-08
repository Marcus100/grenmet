import { describe, expect, it } from "vitest";
import {
  CONTACT_SITE_KEY,
  firstContactError,
  parseContact,
} from "@/lib/contact";

const valid = {
  name: "Jane Traveller",
  email: "jane@example.com",
  subject: "General enquiry",
  message: "When does the Executive Lounge open on Sundays?",
};

function errorFor(input: unknown): string {
  const parsed = parseContact(input);
  if (parsed.success) {
    throw new Error("expected the input to be rejected");
  }
  return firstContactError(parsed.error);
}

describe("parseContact", () => {
  it("accepts a valid submission", () => {
    expect(parseContact(valid).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(parseContact({ ...valid, email: "not-an-email" }).success).toBe(
      false
    );
  });

  it("rejects an unknown subject", () => {
    expect(parseContact({ ...valid, subject: "Hacking" }).success).toBe(false);
  });

  it("rejects a too-short message", () => {
    expect(parseContact({ ...valid, message: "hi" }).success).toBe(false);
  });

  it("trims whitespace before validating", () => {
    const parsed = parseContact({ ...valid, name: "  Jane  " });
    expect(parsed.success && parsed.data.name).toBe("Jane");
  });

  it("treats a whitespace-only name as too short", () => {
    expect(errorFor({ ...valid, name: "   " })).toBe(
      "Name: please enter at least 2 characters."
    );
  });

  it("keeps the Turnstile token under the browser's camelCase name", () => {
    const parsed = parseContact({ ...valid, turnstileToken: "tok-1" });
    expect(parsed.success && parsed.data.turnstileToken).toBe("tok-1");
  });

  it("targets the mbia site key", () => {
    expect(CONTACT_SITE_KEY).toBe("mbia");
  });
});

describe("firstContactError", () => {
  it("names the field that is wrong", () => {
    expect(errorFor({ ...valid, email: "nope" })).toBe(
      "Email: please enter a valid email address."
    );
    expect(errorFor({ ...valid, message: "short" })).toBe(
      "Message: please write at least 10 characters."
    );
    expect(errorFor({ ...valid, subject: "Hacking" })).toBe(
      "Subject: please choose one of the options."
    );
  });

  it("names the field that is too long", () => {
    expect(errorFor({ ...valid, message: "x".repeat(4001) })).toBe(
      "Message is too long. Please shorten it."
    );
    expect(errorFor({ ...valid, name: "x".repeat(121) })).toBe(
      "Name is too long. Please shorten it."
    );
  });
});
