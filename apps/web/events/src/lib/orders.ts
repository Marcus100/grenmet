import { formatMoney } from "@/domain/money";
import type { EventDetail, Money } from "@/domain/types";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const TWO_DIGITS = 2;

/** "Free", or "EC$50.00" for Eastern Caribbean dollars. */
export function formatPrice(price: Money): string {
  if (price.amountMinor === 0) {
    return "Free";
  }
  const text = formatMoney(price);
  return price.currency === "XCD" ? `EC${text}` : text;
}

/** Time left on a hold as "m:ss"; never negative. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(Math.ceil(remainingMs / MS_PER_SECOND), 0);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(TWO_DIGITS, "0")}`;
}

/** Milliseconds until an ISO instant; zero when missing, invalid or past. */
export function msUntil(instant: string | null, now: number): number {
  if (!instant) {
    return 0;
  }
  const at = new Date(instant).getTime();
  return Number.isNaN(at) ? 0 : Math.max(at - now, 0);
}

/** A checkout link is only followed when it is a plain http(s) URL. */
export function safeCheckoutUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * A ticket the member holds on a priced tier was paid online (outlet cash
 * sales have no member), so only the organiser can refund it. The ticket API
 * does not say how it was paid, so match its tier name against the event.
 */
export function isPaidTier(
  tiers: EventDetail["tiers"] | null,
  tierName: string
): boolean {
  return (
    tiers?.some(
      (tier) => tier.name === tierName && tier.price.amountMinor > 0
    ) ?? false
  );
}
