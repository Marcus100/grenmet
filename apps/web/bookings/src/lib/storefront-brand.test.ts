import { describe, expect, it } from "vitest";
import { brandStyle, safeCoverUrl, safeLogoUrl } from "./storefront-brand";

describe("brandStyle", () => {
  it("sets the accent custom properties from a passing colour", () => {
    expect(brandStyle("#0B63EE")).toEqual({
      "--booking-accent": "#0b63ee",
      "--booking-accent-text": "#ffffff",
      "--booking-link": "#0b63ee",
    });
  });

  it.each([
    ["a pale colour", "#777777"],
    ["a non-hex word", "red"],
    ["a hostile value", "red;background:url(x)"],
    ["a short hex", "#0b63e"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
  ])("returns no style for %s", (_label, value) => {
    expect(brandStyle(value)).toBeUndefined();
  });
});

describe("safeLogoUrl", () => {
  it("keeps an https address", () => {
    expect(safeLogoUrl("https://cdn.example.test/logo.png")).toBe(
      "https://cdn.example.test/logo.png"
    );
  });

  it.each([
    ["http", "http://cdn.example.test/logo.png"],
    ["javascript", "javascript:alert(1)"],
    ["a relative path", "/logo.png"],
    ["a malformed value", "https://"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
  ])("shows no logo for %s", (_label, value) => {
    expect(safeLogoUrl(value)).toBeNull();
  });
});

describe("safeCoverUrl", () => {
  it("shows only an https address", () => {
    expect(safeCoverUrl("https://cdn.example.test/c.jpg")).toBe(
      "https://cdn.example.test/c.jpg"
    );
    for (const value of [
      "http://cdn.example.test/c.jpg",
      "javascript:alert(1)",
      "not a url",
      "",
      null,
      undefined,
    ]) {
      expect(safeCoverUrl(value)).toBeNull();
    }
  });
});
