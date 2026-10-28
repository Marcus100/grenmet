import { expect, it } from "vitest";
import { isAboveGreen } from "./alert-level";

it("flags old alerts above green but not green, empty or forecasts", () => {
  expect(isAboveGreen("marine", "Yellow")).toBe(true);
  expect(isAboveGreen("heat", "Orange")).toBe(true);
  expect(isAboveGreen("marine", "Green")).toBe(false);
  expect(isAboveGreen("marine", "")).toBe(false);
  expect(isAboveGreen("morning", "Yellow")).toBe(false);
});
