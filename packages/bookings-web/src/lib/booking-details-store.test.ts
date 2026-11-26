import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearBookingDetails,
  readBookingDetails,
  saveBookingDetails,
} from "./booking-details-store";

const details = {
  email: "ada@example.com",
  marketing: true,
  name: "Ada Lovelace",
  notes: "Allergic to latex",
  phone: "473 555 0100",
};

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("booking details store", () => {
  it("keeps what was typed for this business, and only that", () => {
    saveBookingDetails("studio-a", details);
    expect(readBookingDetails("studio-a")).toEqual(details);
    expect(readBookingDetails("studio-b")).toBeNull();
  });

  it("forgets the details once cleared", () => {
    saveBookingDetails("studio-a", details);
    clearBookingDetails("studio-a");
    expect(readBookingDetails("studio-a")).toBeNull();
  });

  it("ignores a stored value that is not the expected shape", () => {
    window.sessionStorage.setItem(
      "barrels-booking-details:studio-a",
      JSON.stringify(["not", "an", "object"])
    );
    expect(readBookingDetails("studio-a")).toBeNull();
    window.sessionStorage.setItem(
      "barrels-booking-details:studio-a",
      "{not json"
    );
    expect(readBookingDetails("studio-a")).toBeNull();
  });

  it("reads missing fields as empty and caps long text", () => {
    window.sessionStorage.setItem(
      "barrels-booking-details:studio-a",
      JSON.stringify({ name: "x".repeat(5000), marketing: "yes" })
    );
    const read = readBookingDetails("studio-a");
    expect(read?.name).toHaveLength(1000);
    expect(read?.email).toBe("");
    expect(read?.marketing).toBe(false);
  });

  it("does nothing, and does not throw, where storage is refused", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => saveBookingDetails("studio-a", details)).not.toThrow();
    expect(readBookingDetails("studio-a")).toBeNull();
  });
});
