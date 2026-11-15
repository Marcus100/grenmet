import { describe, expect, it } from "vitest";
import { installAdvice, isIos } from "@/lib/install";

describe("installAdvice", () => {
  it("says nothing more once the app runs from the home screen", () => {
    expect(
      installAdvice({ standalone: true, ios: true, canPrompt: true })
    ).toBe("installed");
  });

  it("offers the browser's prompt when there is one", () => {
    expect(
      installAdvice({ standalone: false, ios: false, canPrompt: true })
    ).toBe("prompt");
  });

  it("spells out the steps on iPhone and points to the menu elsewhere", () => {
    expect(
      installAdvice({ standalone: false, ios: true, canPrompt: false })
    ).toBe("ios-steps");
    expect(
      installAdvice({ standalone: false, ios: false, canPrompt: false })
    ).toBe("menu");
  });
});

describe("isIos", () => {
  it("recognises iPhone and a touch-screen iPad that reports as a Mac", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(
      true
    );
  });

  it("does not mistake a Mac or an Android phone", () => {
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(
      false
    );
    expect(isIos("Mozilla/5.0 (Linux; Android 16; Pixel 9)", 5)).toBe(false);
  });
});
