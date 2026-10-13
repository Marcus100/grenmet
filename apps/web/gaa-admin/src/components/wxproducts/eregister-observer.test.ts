import { expect, it } from "vitest";
import { observerInitials } from "./eregister-observer";

it("takes the first letter of each name", () => {
  expect(observerInitials("Marcus Whint")).toBe("MW");
  expect(observerInitials("anne-marie o. clarke")).toBe("AMO");
});

it("is empty when there is no name", () => {
  expect(observerInitials(undefined)).toBe("");
  expect(observerInitials("  ")).toBe("");
});
