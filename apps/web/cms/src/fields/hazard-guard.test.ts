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
