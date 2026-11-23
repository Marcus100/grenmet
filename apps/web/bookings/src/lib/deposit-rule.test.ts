import { describe, expect, it } from "vitest";
import {
  DEPOSIT_OFF,
  depositPreviewMinor,
  depositRuleFields,
} from "./deposit-rule";

const percentOn = (percentText: string) =>
  depositRuleFields({
    on: true,
    mode: "percent",
    percentText,
    fixedText: "",
  });

const fixedOn = (fixedText: string) =>
  depositRuleFields({ on: true, mode: "fixed", percentText: "", fixedText });

describe("depositRuleFields", () => {
  it("is off by default: mode none with no amounts", () => {
    expect(
      depositRuleFields({
        on: false,
        mode: "percent",
        percentText: "50",
        fixedText: "10",
      })
    ).toEqual({ ok: true, value: DEPOSIT_OFF });
  });

  it("reads a whole percentage from 1 to 100", () => {
    expect(percentOn(" 50 ")).toEqual({
      ok: true,
      value: {
        deposit_mode: "percent",
        deposit_percent: 50,
        deposit_fixed_minor: null,
      },
    });
    expect(percentOn("100").ok).toBe(true);
    expect(percentOn("1").ok).toBe(true);
  });

  it("refuses a percentage outside 1 to 100 or not whole", () => {
    for (const text of ["", "0", "101", "12.5", "abc", "-5"]) {
      expect(percentOn(text).ok).toBe(false);
    }
  });

  it("reads a money amount into minor units", () => {
    expect(fixedOn("50")).toEqual({
      ok: true,
      value: {
        deposit_mode: "fixed",
        deposit_percent: null,
        deposit_fixed_minor: 5000,
      },
    });
    expect(fixedOn("12.34")).toMatchObject({
      ok: true,
      value: { deposit_fixed_minor: 1234 },
    });
  });

  it("refuses a zero, negative or over-precise money amount", () => {
    for (const text of ["", "0", "0.00", "-3", "1.234", "x"]) {
      expect(fixedOn(text).ok).toBe(false);
    }
  });
});

describe("depositPreviewMinor", () => {
  const percent = (value: number) => ({
    deposit_mode: "percent" as const,
    deposit_percent: value,
    deposit_fixed_minor: null,
  });
  const fixed = (minor: number) => ({
    deposit_mode: "fixed" as const,
    deposit_percent: null,
    deposit_fixed_minor: minor,
  });

  it("is zero when the rule is off", () => {
    expect(depositPreviewMinor(DEPOSIT_OFF, 21_000)).toBe(0);
  });

  it("takes the percentage and rounds up to whole currency units", () => {
    expect(depositPreviewMinor(percent(50), 21_000)).toBe(10_500);
    // XCD 31.50 rounds up to XCD 32.00.
    expect(depositPreviewMinor(percent(15), 21_000)).toBe(3200);
    // A tiny share is still at least one whole unit, capped at the price.
    expect(depositPreviewMinor(percent(1), 1)).toBe(1);
  });

  it("takes a fixed amount and caps it at the price", () => {
    expect(depositPreviewMinor(fixed(5000), 21_000)).toBe(5000);
    expect(depositPreviewMinor(fixed(30_000), 21_000)).toBe(21_000);
  });

  it("is zero for a free service", () => {
    expect(depositPreviewMinor(percent(50), 0)).toBe(0);
  });
});
