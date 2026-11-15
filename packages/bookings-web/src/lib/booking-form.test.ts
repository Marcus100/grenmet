import { describe, expect, it } from "vitest";
import { fingerprint, stillWrong, validateBooking } from "./booking-form";

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

describe("stillWrong", () => {
  const submitted = validateBooking({
    ...valid,
    serviceId: null,
    startsAt: null,
    name: "",
    email: "ada@",
  });

  it("drops a message once its field is valid", () => {
    const kept = stillWrong(submitted, {
      ...valid,
      serviceId: null,
      startsAt: null,
      name: "Ada",
      email: "ada@example.com",
    });
    expect(kept).not.toHaveProperty("name");
    expect(kept).not.toHaveProperty("email");
    expect(Object.keys(kept).sort()).toEqual(["service", "time"]);
  });

  it("keeps a message for a field still wrong, worded for what it holds now", () => {
    const kept = stillWrong(submitted, {
      ...valid,
      serviceId: null,
      startsAt: null,
      name: "",
      email: "ada@exa",
    });
    expect(kept.email).toBe(submitted.email);
    expect(kept.name).toBe("Enter your name.");
  });

  it("never adds a message for a field that was not in the submitted errors", () => {
    const kept = stillWrong(
      { name: "Enter your name." },
      { ...valid, name: "", notes: "x".repeat(1001) }
    );
    expect(Object.keys(kept)).toEqual(["name"]);
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
