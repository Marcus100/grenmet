import { describe, expect, it } from "vitest";
import {
  DEPOSIT_OFF,
  depositPreviewMinor,
  depositRuleFields,
  exampleServiceFor,
  minimumPriceFields,
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
    for (const text of [
      "",
      "0",
      "0.00",
      "-3",
      "1.234",
      "12.345",
      "1,000",
      "x",
    ]) {
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

describe("depositPreviewMinor against the API formula", () => {
  // Expected values follow deposit_payments.rule_deposit: a percentage rounds up
  // to whole currency units, and the result never exceeds the price.
  const percent = (value: number) => ({
    deposit_mode: "percent" as const,
    deposit_percent: value,
    deposit_fixed_minor: null,
  });

  it.each([
    [1, 1, 1],
    [1, 15, 1],
    [1, 50, 1],
    [1, 100, 1],
    [99, 1, 99],
    [99, 15, 99],
    [99, 50, 99],
    [99, 100, 99],
    [10_500, 1, 200],
    [10_500, 15, 1600],
    [10_500, 50, 5300],
    [10_500, 100, 10_500],
    [14_999, 1, 200],
    [14_999, 15, 2300],
    [14_999, 50, 7500],
    [14_999, 100, 14_999],
  ])("price %i minor at %i%% is %i minor", (price, value, expected) => {
    expect(depositPreviewMinor(percent(value), price)).toBe(expected);
  });
});

describe("exampleServiceFor", () => {
  const service = (
    name: string,
    fields: Partial<{
      active: boolean;
      price_minor: number;
      deposit_minor: number;
    }> = {}
  ) => ({
    name,
    active: true,
    price_minor: 10_000,
    deposit_minor: 0,
    ...fields,
  });

  it("prefers the first active priced service with no deposit of its own", () => {
    expect(
      exampleServiceFor([
        service("Facial", { deposit_minor: 2500 }),
        service("Massage"),
      ])
    ).toEqual({ name: "Massage", priceMinor: 10_000, ownDepositMinor: 0 });
  });

  it("falls back to a service with its own deposit, which the preview labels", () => {
    expect(
      exampleServiceFor([service("Facial", { deposit_minor: 2500 })])
    ).toEqual({ name: "Facial", priceMinor: 10_000, ownDepositMinor: 2500 });
  });

  it("skips inactive and free services", () => {
    expect(
      exampleServiceFor([
        service("Retired", { active: false }),
        service("Free", { price_minor: 0 }),
      ])
    ).toBeNull();
    expect(exampleServiceFor([])).toBeNull();
  });
});

describe("minimumPriceFields", () => {
  it("is no minimum when blank", () => {
    expect(minimumPriceFields("")).toEqual({ ok: true, value: null });
    expect(minimumPriceFields("  ")).toEqual({ ok: true, value: null });
  });

  it("reads a money figure in minor units", () => {
    expect(minimumPriceFields("50")).toEqual({ ok: true, value: 5000 });
    expect(minimumPriceFields("50.50")).toEqual({ ok: true, value: 5050 });
  });

  it("refuses zero, negative, too many decimals and words", () => {
    for (const text of ["0", "-5", "10.555", "fifty"]) {
      expect(minimumPriceFields(text)).toMatchObject({ ok: false });
    }
  });
});

describe("depositPreviewMinor with a minimum price", () => {
  const fixed = (minor: number, min: number | null) => ({
    deposit_mode: "fixed" as const,
    deposit_percent: null,
    deposit_fixed_minor: minor,
    deposit_min_price_minor: min,
  });

  it("takes no deposit below the minimum and the deposit at the minimum", () => {
    expect(depositPreviewMinor(fixed(4000, 5000), 1500)).toBe(0);
    expect(depositPreviewMinor(fixed(4000, 5000), 4999)).toBe(0);
    expect(depositPreviewMinor(fixed(4000, 5000), 5000)).toBe(4000);
  });

  it("has no minimum when none is set", () => {
    // The fixed amount is capped at the price: min(4000, 1500).
    expect(depositPreviewMinor(fixed(4000, null), 1500)).toBe(1500);
  });
});
