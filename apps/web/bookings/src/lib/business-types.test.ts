import { describe, expect, it } from "vitest";
import {
  BUSINESS_TYPES,
  businessTypeLabel,
  parseBusinessType,
} from "./business-types";

describe("business types", () => {
  it("names all eleven kinds in plain words", () => {
    expect(BUSINESS_TYPES.map(businessTypeLabel)).toEqual([
      "Beauty",
      "Hair",
      "Health",
      "Fitness",
      "Auto",
      "Home",
      "Lessons",
      "Professional",
      "Tours",
      "Events",
      "Other",
    ]);
  });

  it("parses only a kind the API knows", () => {
    expect(parseBusinessType("home_services")).toBe("home_services");
    expect(parseBusinessType("Home")).toBeUndefined();
    expect(parseBusinessType(undefined)).toBeUndefined();
  });
});
