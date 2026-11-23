import { describe, expect, it } from "vitest";
import {
  defaultColour,
  isRaisableProduct,
  isWarningColour,
  localStampWords,
  MIN_OVERRIDE_REASON,
  matrixInputs,
  raisableLabel,
  raisableProducts,
  reasonProblem,
  reasonRequired,
  validityWords,
} from "./escalations";

describe("raisable products", () => {
  it("accepts the nine hazard kinds the API raises", () => {
    for (const kind of [
      "cyclone",
      "marine",
      "flood",
      "thunderstorm",
      "wind",
      "heat",
      "dust",
      "coastal",
      "tsunami",
    ]) {
      expect(isRaisableProduct({ kind })).toBe(true);
    }
  });

  it("never offers forecasts or the outlook", () => {
    for (const kind of [
      "morning",
      "midday",
      "evening",
      "outlook",
      "marine-forecast",
      "climate-bulletin",
    ]) {
      expect(isRaisableProduct({ kind })).toBe(false);
    }
  });

  it("filters a product list down to hazard alerts", () => {
    const products = [
      { kind: "morning" },
      { kind: "flood" },
      { kind: "outlook" },
    ] as never[];
    expect(raisableProducts(products)).toEqual([{ kind: "flood" }]);
  });

  it("labels a kind with the GMS bulletin name", () => {
    expect(raisableLabel("flood")).toBe("Flood / Heavy Rain");
    expect(raisableLabel("unknown-kind")).toBe("unknown-kind");
  });
});

describe("warning colours", () => {
  it("never offers green: a raised alert is a warning colour", () => {
    expect(isWarningColour("green")).toBe(false);
    expect(isWarningColour("yellow")).toBe(true);
    expect(isWarningColour("red")).toBe(true);
  });

  it("defaults to the matrix colour when it is a warning colour", () => {
    expect(defaultColour({ colour: "orange", kind: "suggested" })).toBe(
      "orange"
    );
  });

  it("defaults to yellow when the matrix suggests green or nothing", () => {
    expect(defaultColour({ colour: "green", kind: "suggested" })).toBe(
      "yellow"
    );
    expect(defaultColour({ kind: "none" })).toBe("yellow");
    expect(defaultColour({ kind: "unknown" })).toBe("yellow");
  });
});

describe("reason for a different colour", () => {
  it("is required only when the matrix suggests another colour", () => {
    expect(reasonRequired({ colour: "orange", kind: "suggested" }, "red")).toBe(
      true
    );
    expect(
      reasonRequired({ colour: "orange", kind: "suggested" }, "orange")
    ).toBe(false);
    expect(reasonRequired({ kind: "none" }, "red")).toBe(false);
    expect(reasonRequired({ kind: "unknown" }, "red")).toBe(false);
  });

  it("needs the minimum length when required", () => {
    const short = "x".repeat(MIN_OVERRIDE_REASON - 1);
    const enough = "x".repeat(MIN_OVERRIDE_REASON);
    expect(reasonProblem("", true)).not.toBeNull();
    expect(reasonProblem(short, true)).not.toBeNull();
    expect(reasonProblem(enough, true)).toBeNull();
  });

  it("counts the trimmed length, as the API does", () => {
    expect(reasonProblem("   short    ", true)).not.toBeNull();
    expect(reasonProblem("  ten chars!  ", true)).toBeNull();
  });

  it("is optional when not required, but a short entry still needs fixing", () => {
    expect(reasonProblem("", false)).toBeNull();
    expect(reasonProblem("abc", false)).not.toBeNull();
  });
});

describe("matrix inputs", () => {
  it("reads a saved likelihood and impact the matrix knows", () => {
    expect(matrixInputs({ impact: "Severe", likelihood: "High" })).toEqual({
      impact: "Severe",
      likelihood: "High",
    });
  });

  it("returns null when either value is missing or unknown", () => {
    expect(matrixInputs({ impact: "Severe" })).toBeNull();
    expect(matrixInputs({ impact: "Huge", likelihood: "High" })).toBeNull();
    expect(
      matrixInputs({ impact: "Severe", likelihood: "Certain" })
    ).toBeNull();
  });
});

describe("local stamps", () => {
  it("shows a saved Grenada-time stamp in words", () => {
    expect(localStampWords("2026-11-23T10:05")).toBe("23 Nov 2026, 10:05");
    expect(localStampWords("2026-01-07T07:00")).toBe("7 Jan 2026, 07:00");
  });

  it("shows anything unexpected as it was saved, and missing as not set", () => {
    expect(localStampWords("tomorrow")).toBe("tomorrow");
    expect(localStampWords(undefined)).toBe("not set");
    expect(localStampWords("2026-13-01T10:00")).toBe("2026-13-01T10:00");
  });

  it("builds the validity line from a product's values", () => {
    expect(
      validityWords({
        validFrom: "2026-11-23T06:00",
        validTo: "2026-11-24T07:00",
      })
    ).toBe("Valid 23 Nov 2026, 06:00 to 24 Nov 2026, 07:00 (Grenada time).");
  });
});
