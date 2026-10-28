import { describe, expect, it } from "vitest";
import { assertNoUnlinkedHazard, isCapLink } from "./hazard-guard";

describe("warning language guard", () => {
  it("rejects warning words without a CAP link", () => {
    expect(() =>
      assertNoUnlinkedHazard(["A flood Warning is in effect"], false)
    ).toThrow('"Warning" reads like an official warning');
    expect(() => assertNoUnlinkedHazard(["Watches issued"], false)).toThrow();
    expect(() =>
      assertNoUnlinkedHazard([null, "Small craft advisory"], false)
    ).toThrow();
  });
  it("allows warning words with a CAP link, and ordinary words", () => {
    expect(() => assertNoUnlinkedHazard(["Flood warning"], true)).not.toThrow();
    expect(() =>
      assertNoUnlinkedHazard(["Watchful skies and a warm afternoon"], false)
    ).not.toThrow();
  });
  it("recognises CAP links", () => {
    expect(
      isCapLink({ category: "cap", url: "https://weather.gd/alerts/1" })
    ).toBe(true);
    expect(isCapLink({ category: "forecast", url: "https://weather.gd" })).toBe(
      false
    );
  });
});

it("counts a pasted warning address as a CAP link", () => {
  expect(
    isCapLink({
      category: "article",
      url: "https://weather.barrels.gd/alerts/GMS-1",
    })
  ).toBe(true);
  expect(isCapLink({ category: "article", url: "/alerts/GMS-1" })).toBe(true);
  expect(isCapLink({ category: "article", url: "/weather/radar" })).toBe(false);
  expect(isCapLink({ category: "cap", url: "" })).toBe(false);
});
