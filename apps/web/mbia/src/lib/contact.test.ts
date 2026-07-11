import { describe, expect, it } from "vitest";
import { contactSchema } from "@/lib/contact";

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

  it("trims whitespace", () => {
    const parsed = contactSchema.parse({ ...valid, name: "  Jane  " });
    expect(parsed.name).toBe("Jane");
  });
});
