import { describe, expect, it } from "vitest";
import { fingerprint, validateBooking } from "./booking-form";

const valid = {
  serviceId: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
  startsAt: "2027-01-05T13:30:00Z",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "",
  notes: "",
};

describe("validateBooking", () => {
  it("accepts a complete request with optional fields empty", () => {
    expect(validateBooking(valid)).toEqual({});
  });

  it("asks for what is missing", () => {
    const errors = validateBooking({
      ...valid,
      serviceId: null,
      startsAt: null,
      name: "  ",
      email: "",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "email",
      "name",
      "service",
      "time",
    ]);
  });

  it("rejects a malformed email, phone and over-long note", () => {
    const errors = validateBooking({
      ...valid,
      email: "ada@",
      phone: "call me",
      notes: "x".repeat(1001),
    });
    expect(errors.email).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(errors.notes).toBeDefined();
  });
});

describe("fingerprint", () => {
  it("is stable for the same request and changes with any field", () => {
    const base = { ...valid, marketing: false };
    expect(fingerprint(base)).toBe(
      fingerprint({ ...base, name: " Ada Lovelace " })
    );
    expect(fingerprint(base)).not.toBe(
      fingerprint({ ...base, marketing: true })
    );
    expect(fingerprint(base)).not.toBe(
      fingerprint({ ...base, startsAt: "2027-01-05T14:00:00Z" })
    );
  });
});
