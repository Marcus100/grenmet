"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Check, Clock, Minus, Plus, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { claimTickets } from "@/data/actions";
import type { EventDetail, MyOrder } from "@/domain/types";
import { formatTime } from "@/lib/datetime";
import { goToCheckout } from "@/lib/navigation";
import { formatPrice, safeCheckoutUrl } from "@/lib/orders";

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
 * Claim tickets. Free and registration tiers issue at once. A paid tier
 * creates an order that holds the stock: the buyer is sent to the payment
 * page, or, when the organiser takes payment by hand, told the tickets are
 * reserved. Guests can see the tiers; claiming sends them to sign in.
 */
export function TicketClaim({
  slug,
  tiers,
}: {
  slug: string;
  tiers: readonly Tier[];
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { error, pending, perform } = useMemberAction();
  // One key per distinct selection: a retry of the same basket reuses it so a
  // double click or a dropped response converges on a single order.
  const attempt = useRef<{ key: string; signature: string } | null>(null);

  const chosen = tiers
    .map((tier) => ({ tierId: tier.id, quantity: quantities[tier.id] ?? 0 }))
    .filter((item) => item.quantity > 0);
  const total = chosen.reduce((sum, item) => sum + item.quantity, 0);
  const paid = chosen.some(
    (item) =>
      (tiers.find((tier) => tier.id === item.tierId)?.price.amountMinor ?? 0) >
      0
  );

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
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
              key={tier.id}
            >
              <div className="min-w-0">
                <p className="font-medium text-body">{tier.name}</p>
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
      <Button
        className="h-11 w-full text-body-base"
        disabled={pending || total === 0 || outcome?.kind === "redirecting"}
        onClick={submit}
        size="lg"
      >
        <Ticket data-icon="inline-start" />
        {buttonLabel(total, paid)}
      </Button>
      <OutcomeNotice outcome={outcome} />
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function buttonLabel(total: number, paid: boolean): string {
  if (total === 0) {
    return "Get tickets";
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
        className="space-y-1 rounded-xl border border-border bg-muted p-3 text-body"
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
    <p className="flex items-center gap-1 text-body text-primary" role="status">
      <Check className="size-4" />
      You have {outcome.count} new ticket{outcome.count === 1 ? "" : "s"}.{" "}
      <Link className="underline" href="/me/tickets">
        Open My tickets
      </Link>
    </p>
  );
}
