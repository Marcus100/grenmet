import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOLD_VALUE,
  depositHoldField,
  HOLD_INVALID,
  holdOptions,
  holdValue,
} from "./deposit-hold";

describe("holdValue", () => {
  it("maps the default to the select's default value and minutes to text", () => {
    expect(holdValue(null)).toBe(DEFAULT_HOLD_VALUE);
    expect(holdValue(1440)).toBe("1440");
  });
});

describe("holdOptions", () => {
  it("offers the default first, then the sensible choices", () => {
    expect(holdOptions(null).map((option) => option.label)).toEqual([
      "Default (30 minutes)",
      "30 minutes",
      "2 hours",
      "12 hours",
      "24 hours",
      "48 hours",
      "3 days",
      "7 days",
    ]);
  });

  it("keeps a saved value that is not a choice as its own option", () => {
    const options = holdOptions(90);
    expect(options.at(-1)).toEqual({ label: "90 minutes", value: "90" });
  });

  it("adds nothing extra for a saved choice", () => {
    expect(holdOptions(120)).toHaveLength(8);
  });
});

describe("depositHoldField", () => {
  it("reads the default as null", () => {
    expect(depositHoldField(DEFAULT_HOLD_VALUE)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("reads whole minutes from 1 to 10080", () => {
    expect(depositHoldField("1")).toEqual({ ok: true, value: 1 });
    expect(depositHoldField("10080")).toEqual({ ok: true, value: 10_080 });
  });

  it.each(["0", "10081", "1.5", "-30", "soon"])(
    "refuses %s with the same plain message",
    (text) => {
      expect(depositHoldField(text)).toEqual({
        ok: false,
        message: HOLD_INVALID,
      });
    }
  );
});
