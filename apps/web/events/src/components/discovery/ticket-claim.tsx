"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Check, Clock, Minus, Plus, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { claimTickets } from "@/data/actions";
import { money } from "@/domain/money";
import type { EventDetail, Money, MyOrder, RefundTerms } from "@/domain/types";
import { formatTime } from "@/lib/datetime";
import { goToCheckout } from "@/lib/navigation";
import { formatPrice, safeCheckoutUrl } from "@/lib/orders";
import { RefundTermsLine } from "./refund-terms-line";

type Tier = EventDetail["tiers"][number];

/** What the buyer sees after a submit that did not issue tickets at once. */
type Outcome =
  | { readonly kind: "issued"; readonly count: number }
  | { readonly kind: "redirecting" }
  | { readonly kind: "reserved"; readonly order: MyOrder };

/** How many more tickets this member can claim for the tier right now. */
export function claimableCount(tier: Tier): number {
  return Math.max(
    Math.min(tier.perAccountLimit - tier.held, tier.remaining),
    0
  );
}

function tierNote(tier: Tier): string | null {
  if (tier.remaining <= 0) {
    return "Sold out";
  }
  if (tier.held >= tier.perAccountLimit) {
    return `You have the most allowed (${tier.held})`;
  }
  return null;
}

function newKey(): string {
  return crypto.randomUUID();
}

/**
 * On a phone the action block sits fixed at the bottom of the screen, so the
 * price and the main button stay in reach while the tiers scroll. From the
 * laptop breakpoint it is an ordinary block inside the buy card.
 */
export const ACTION_BLOCK_CLASS = cn(
  "space-y-2",
  "max-lg:border-border max-lg:bg-card max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:px-4 max-lg:pt-3 max-lg:pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] max-lg:shadow-lg",
  // The installed app's bottom tab bar (BottomNav) is 3.5rem tall and carries
  // the safe-area inset itself, so the bar sits above it by both. Its own
  // bottom padding then drops the inset, which the offset already clears.
  "max-md:standalone:bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] max-lg:standalone:pb-3"
);

/**
 * Claim tickets. Free and registration tiers issue at once. A paid tier
 * creates an order that holds the stock: the buyer is sent to the payment
 * page, or, when the organiser takes payment by hand, told the tickets are
 * reserved. Guests can see the tiers; claiming sends them to sign in.
 */
export function TicketClaim({
  refundTerms,
  slug,
  tiers,
}: {
  slug: string;
  tiers: readonly Tier[];
  /** The event's refund terms, shown above the pay button when a tier is paid. */
  refundTerms: RefundTerms;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { error, pending, perform } = useMemberAction();
  // One key per distinct selection: a retry of the same basket reuses it so a
  // double click or a dropped response converges on a single order.
  const attempt = useRef<{ key: string; signature: string } | null>(null);
  // Errors and confirmations sit in the card. On a phone the fixed action block
  // can hide them, so they are brought into view when they change.
  const noticeRef = useRef<HTMLDivElement>(null);

  const chosen = tiers
    .map((tier) => ({ tierId: tier.id, quantity: quantities[tier.id] ?? 0 }))
    .filter((item) => item.quantity > 0);
  const total = chosen.reduce((sum, item) => sum + item.quantity, 0);
  const paid = chosen.some(
    (item) =>
      (tiers.find((tier) => tier.id === item.tierId)?.price.amountMinor ?? 0) >
      0
  );
  const subtotal = chosenSubtotal(tiers, chosen);
  const lowest = lowestTier(tiers);

  useEffect(() => {
    if (outcome === null && !error) {
      return;
    }
    noticeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [outcome, error]);

  function change(tier: Tier, delta: number) {
    const next = (quantities[tier.id] ?? 0) + delta;
    setQuantities({
      ...quantities,
      [tier.id]: Math.min(Math.max(next, 0), claimableCount(tier)),
    });
  }

  function keyFor(): string | undefined {
    if (!paid) {
      return undefined;
    }
    const signature = JSON.stringify(chosen);
    if (attempt.current?.signature !== signature) {
      attempt.current = { key: newKey(), signature };
    }
    return attempt.current.key;
  }

  async function submit() {
    setOutcome(null);
    const result = await perform(() => claimTickets(slug, chosen, keyFor()));
    if (!result.ok) {
      // The server said this attempt is over (payment unavailable or expired):
      // start over. Any other failure keeps the key, so a retry replays the order.
      if ("freshKey" in result && result.freshKey) {
        attempt.current = null;
      }
      return;
    }
    attempt.current = null;
    setQuantities({});
    const order = result.data;
    if (order.status === "pending_payment" && order.paymentRequired) {
      const url = safeCheckoutUrl(order.checkoutUrl);
      if (url) {
        setOutcome({ kind: "redirecting" });
        goToCheckout(url);
        return;
      }
      setOutcome({ kind: "reserved", order });
    } else {
      setOutcome({ kind: "issued", count: order.ticketIds.length });
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {tiers.map((tier) => {
          const limit = claimableCount(tier);
          const note = tierNote(tier);
          const quantity = quantities[tier.id] ?? 0;
          return (
            <li
              className="border-border flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              key={tier.id}
            >
              <div className="min-w-0">
                <p className="text-body font-medium">{tier.name}</p>
                <p className="text-caption text-muted-foreground">
                  {formatPrice(tier.price)}
                  {note ? ` · ${note}` : ` · ${tier.remaining} left`}
                </p>
              </div>
              {limit > 0 ? (
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`Fewer ${tier.name} tickets`}
                    disabled={pending || quantity === 0}
                    onClick={() => change(tier, -1)}
                    size="icon"
                    variant="outline"
                  >
                    <Minus />
                  </Button>
                  <output
                    aria-label={`${tier.name} tickets`}
                    className="w-6 text-center font-semibold tabular-nums"
                  >
                    {quantity}
                  </output>
                  <Button
                    aria-label={`More ${tier.name} tickets`}
                    disabled={pending || quantity >= limit}
                    onClick={() => change(tier, 1)}
                    size="icon"
                    variant="outline"
                  >
                    <Plus />
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {tiers.some((tier) => tier.price.amountMinor > 0) ? (
        <RefundTermsLine terms={refundTerms} />
      ) : null}
      <div className={ACTION_BLOCK_CLASS}>
        <p className="text-body flex items-baseline justify-between gap-3">
          <span className="font-medium" data-testid="ticket-summary">
            {total === 0
              ? startingPriceLabel(lowest)
              : `${total} ticket${total === 1 ? "" : "s"}`}
          </span>
          {total > 0 && subtotal ? (
            <span className="font-display font-bold tabular-nums">
              {formatPrice(subtotal)}
            </span>
          ) : null}
        </p>
        <Button
          className="text-body-base h-11 w-full"
          disabled={pending || total === 0 || outcome?.kind === "redirecting"}
          onClick={submit}
          size="lg"
        >
          <Ticket data-icon="inline-start" />
          {buttonLabel(total, paid)}
        </Button>
      </div>
      <div className="space-y-3" ref={noticeRef}>
        <OutcomeNotice outcome={outcome} />
        {error ? (
          <p className="text-caption text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The cheapest tier, the price the bar shows before any ticket is chosen. */
function lowestTier(tiers: readonly Tier[]): Tier | null {
  return tiers.reduce<Tier | null>(
    (best, tier) =>
      best === null || tier.price.amountMinor < best.price.amountMinor
        ? tier
        : best,
    null
  );
}

function startingPriceLabel(lowest: Tier | null): string {
  if (!lowest) {
    return "";
  }
  return lowest.price.amountMinor === 0
    ? "Free"
    : `From ${formatPrice(lowest.price)}`;
}

/** What the chosen tickets cost together, or null when nothing is chosen. */
function chosenSubtotal(
  tiers: readonly Tier[],
  chosen: readonly { tierId: string; quantity: number }[]
): Money | null {
  let subtotal: Money | null = null;
  for (const item of chosen) {
    const tier = tiers.find((candidate) => candidate.id === item.tierId);
    if (!tier) {
      continue;
    }
    const line = tier.price.amountMinor * item.quantity;
    subtotal = money((subtotal?.amountMinor ?? 0) + line, tier.price.currency);
  }
  return subtotal;
}

/**
 * The button says what is missing while nothing is chosen, so a disabled
 * button is never a mystery.
 */
function buttonLabel(total: number, paid: boolean): string {
  if (total === 0) {
    return "Choose how many tickets";
  }
  const noun = `ticket${total === 1 ? "" : "s"}`;
  return paid ? `Pay for ${total} ${noun}` : `Get ${total} ${noun}`;
}

function OutcomeNotice({ outcome }: { outcome: Outcome | null }) {
  if (outcome === null) {
    return null;
  }
  if (outcome.kind === "redirecting") {
    return (
      <p className="text-body text-muted-foreground" role="status">
        Taking you to secure payment…
      </p>
    );
  }
  if (outcome.kind === "reserved") {
    const { order } = outcome;
    return (
      <div
        className="border-border bg-muted text-body space-y-1 rounded-xl border p-3"
        role="status"
      >
        <p className="flex items-center gap-1 font-semibold">
          <Clock className="size-4" />
          Reserved, awaiting payment
        </p>
        <p>
          {order.paymentExpiresAt
            ? `We are holding your tickets until ${formatTime(order.paymentExpiresAt)}. `
            : "We are holding your tickets for a short time. "}
          Pay the organiser before then; they will record your payment and your
          tickets appear in My tickets. If the hold runs out the tickets go back
          on sale.
        </p>
        <Link className="underline" href={`/me/orders/${order.id}`}>
          View this order
        </Link>
      </div>
    );
  }
  return (
    <p className="text-body text-primary flex items-center gap-1" role="status">
      <Check className="size-4" />
      You have {outcome.count} new ticket{outcome.count === 1 ? "" : "s"}.{" "}
      <Link className="underline" href="/me/tickets">
        Open My tickets
      </Link>
    </p>
  );
}
