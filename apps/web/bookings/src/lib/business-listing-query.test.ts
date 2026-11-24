import { describe, expect, it } from "vitest";
import { listingQuery } from "./business-listing-query";

describe("listingQuery", () => {
  it("reads the search, category and page from the address", () => {
    expect(
      listingQuery({ q: " barber ", category: "Hair", page: "2" })
    ).toEqual({
      q: "barber",
      category: "Hair",
      type: undefined,
      page: 2,
    });
  });

  it("reads a business type the API knows", () => {
    expect(listingQuery({ type: "home_services" }).type).toBe("home_services");
    expect(listingQuery({ type: [" hair ", "auto"] }).type).toBe("hair");
  });

  it("ignores a business type the API does not know", () => {
    for (const type of [
      "",
      "Hair",
      "spa",
      "HOME",
      "constructor",
      "__proto__",
    ]) {
      expect(listingQuery({ type }).type).toBeUndefined();
    }
  });

  it("leaves a missing or blank value out", () => {
    expect(listingQuery({ q: "   ", category: undefined })).toEqual({
      q: undefined,
      category: undefined,
      type: undefined,
      page: 1,
    });
  });

  it("falls back to the first page for anything that is not a page number", () => {
    for (const page of ["0", "-3", "abc", "1.5", "", "99999999999"]) {
      expect(listingQuery({ page }).page).toBe(1);
    }
    expect(listingQuery({ page: "1001" }).page).toBe(1);
  });

  it("takes the first value of a repeated parameter and caps its length", () => {
    const long = "x".repeat(200);
    const query = listingQuery({ q: [long, "other"], category: long });
    expect(query.q).toHaveLength(80);
    expect(query.category).toHaveLength(80);
  });
});
