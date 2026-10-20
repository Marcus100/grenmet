import { describe, expect, it } from "vitest";
import type { EventDetail } from "@/domain/types";
import {
  formatCountdown,
  formatPrice,
  isPaidTier,
  msUntil,
  safeCheckoutUrl,
} from "./orders";

const tiers: EventDetail["tiers"] = [
  {
    id: "a",
    name: "General",
    allocation: 10,
    held: 0,
    perAccountLimit: 4,
    remaining: 10,
    price: { amountMinor: 0, currency: "XCD" },
  },
  {
    id: "b",
    name: "VIP",
    allocation: 10,
    held: 0,
    perAccountLimit: 4,
    remaining: 10,
    price: { amountMinor: 5000, currency: "XCD" },
  },
];

describe("orders helpers", () => {
  it("formats prices", () => {
    expect(formatPrice({ amountMinor: 0, currency: "XCD" })).toBe("Free");
    expect(formatPrice({ amountMinor: 5050, currency: "XCD" })).toBe(
      "EC$50.50"
    );
    expect(formatPrice({ amountMinor: 5000, currency: "USD" })).toBe("$50.00");
  });

  it("formats and clamps countdowns", () => {
    expect(formatCountdown(1_800_000)).toBe("30:00");
    expect(formatCountdown(61_001)).toBe("1:02");
    expect(formatCountdown(-5)).toBe("0:00");
    expect(msUntil(null, 0)).toBe(0);
    expect(msUntil("nope", 0)).toBe(0);
  });

  it("only follows http(s) checkout links", () => {
    expect(safeCheckoutUrl("https://pay.example/x")).toBe(
      "https://pay.example/x"
    );
    expect(safeCheckoutUrl("javascript:alert(1)")).toBeNull();
    expect(safeCheckoutUrl("not a url")).toBeNull();
    expect(safeCheckoutUrl(null)).toBeNull();
  });

  it("spots a paid tier by name", () => {
    expect(isPaidTier(tiers, "VIP")).toBe(true);
    expect(isPaidTier(tiers, "General")).toBe(false);
    expect(isPaidTier(null, "VIP")).toBe(false);
  });
});
