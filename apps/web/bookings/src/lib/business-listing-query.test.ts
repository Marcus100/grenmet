import { describe, expect, it } from "vitest";
import { listingQuery } from "./business-listing-query";

describe("listingQuery", () => {
  it("reads the search, category and page from the address", () => {
    expect(
      listingQuery({ q: " barber ", category: "Hair", page: "2" })
    ).toEqual({ q: "barber", category: "Hair", page: 2 });
  });

  it("leaves a missing or blank value out", () => {
    expect(listingQuery({ q: "   ", category: undefined })).toEqual({
      q: undefined,
      category: undefined,
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
