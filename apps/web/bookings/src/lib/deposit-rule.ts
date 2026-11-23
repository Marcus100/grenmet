// The business-wide deposit rule for the studio Settings screen: reading the
// form into the three profile fields, and the live preview. The API decides the
// real amount (`deposit_payments.rule_deposit`); the preview follows the same
// rule so the owner sees what customers will be asked to pay.

import type { BookingDepositMode } from "@barrelsgd/api-client";
import { parseMoney } from "./settings-view";

/** The three profile fields a deposit rule saves. */
export interface DepositRuleFields {
  deposit_fixed_minor: number | null;
  deposit_mode: BookingDepositMode;
  deposit_percent: number | null;
}

export const DEPOSIT_OFF: DepositRuleFields = {
  deposit_mode: "none",
  deposit_percent: null,
  deposit_fixed_minor: null,
};

/** The largest amount the API takes, in minor units. */
const MAX_MINOR = 100_000_000;
const WHOLE_NUMBER = /^\d+$/u;
const PER_HUNDRED_PERCENT = 10_000;

/**
 * The service the preview works out a sentence for. `ownDepositMinor` is the
 * service's own deposit: when above zero it wins over the business rule.
 */
export interface ExampleService {
  name: string;
  ownDepositMinor: number;
  priceMinor: number;
}

/**
 * The example for the preview: the first active, priced service with no deposit
 * of its own, else the first active priced service (its own deposit is then
 * shown and labelled). Null when there is no priced service to show.
 */
export function exampleServiceFor(
  services: {
    name: string;
    active: boolean;
    price_minor: number;
    deposit_minor: number;
  }[]
): ExampleService | null {
  const priced = services.filter((s) => s.active && s.price_minor > 0);
  const service = priced.find((s) => s.deposit_minor === 0) ?? priced[0];
  return service
    ? {
        name: service.name,
        priceMinor: service.price_minor,
        ownDepositMinor: service.deposit_minor,
      }
    : null;
}

export type DepositRuleResult =
  | { ok: true; value: DepositRuleFields }
  | { ok: false; message: string };

/**
 * The rule as the form states it. Switched off means `none` with no amounts.
 * A percentage is a whole number from 1 to 100; a fixed amount is a money
 * figure above zero with at most two decimals, stored in minor units.
 */
export function depositRuleFields(input: {
  on: boolean;
  mode: "percent" | "fixed";
  percentText: string;
  fixedText: string;
}): DepositRuleResult {
  if (!input.on) {
    return { ok: true, value: DEPOSIT_OFF };
  }
  if (input.mode === "percent") {
    const text = input.percentText.trim();
    const percent = Number(text);
    if (!WHOLE_NUMBER.test(text) || percent < 1 || percent > 100) {
      return {
        ok: false,
        message: "The deposit percentage is a whole number from 1 to 100.",
      };
    }
    return {
      ok: true,
      value: {
        deposit_mode: "percent",
        deposit_percent: percent,
        deposit_fixed_minor: null,
      },
    };
  }
  const minor = parseMoney(input.fixedText);
  if (minor === null || minor <= 0 || minor > MAX_MINOR) {
    return {
      ok: false,
      message:
        "The deposit amount is more than zero, with at most two decimal places.",
    };
  }
  return {
    ok: true,
    value: {
      deposit_mode: "fixed",
      deposit_percent: null,
      deposit_fixed_minor: minor,
    },
  };
}

/**
 * The deposit a booking of a service priced `priceMinor` would ask for under the
 * rule: a percentage rounds up to whole currency units and never exceeds the
 * price; a fixed amount is capped at the price. Zero when the rule is off.
 */
export function depositPreviewMinor(
  rule: DepositRuleFields,
  priceMinor: number
): number {
  if (priceMinor <= 0) {
    return 0;
  }
  if (rule.deposit_mode === "percent" && rule.deposit_percent) {
    const wholeUnits = Math.floor(
      (priceMinor * rule.deposit_percent + PER_HUNDRED_PERCENT - 1) /
        PER_HUNDRED_PERCENT
    );
    return Math.min(wholeUnits * 100, priceMinor);
  }
  if (rule.deposit_mode === "fixed" && rule.deposit_fixed_minor) {
    return Math.min(rule.deposit_fixed_minor, priceMinor);
  }
  return 0;
}
