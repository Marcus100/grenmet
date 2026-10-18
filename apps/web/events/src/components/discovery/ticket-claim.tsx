"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Check, Minus, Plus, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { claimTickets } from "@/data/actions";
import type { EventDetail } from "@/domain/types";

type Tier = EventDetail["tiers"][number];

const PAID_NOTE = "Online payment arrives with the payments step";

/** How many more tickets this member can claim for the tier right now. */
export function claimableCount(tier: Tier): number {
  if (tier.price.amountMinor > 0) {
    return 0;
  }
  return Math.max(
    Math.min(tier.perAccountLimit - tier.held, tier.remaining),
    0
  );
}

function tierNote(tier: Tier): string | null {
  if (tier.price.amountMinor > 0) {
    return PAID_NOTE;
  }
  if (tier.remaining <= 0) {
    return "Sold out";
  }
  if (tier.held >= tier.perAccountLimit) {
    return `You have the most allowed (${tier.held})`;
  }
  return null;
}

function priceText(tier: Tier): string {
  if (tier.price.amountMinor === 0) {
    return "Free";
  }
  return `EC$${Math.trunc(tier.price.amountMinor / 100).toLocaleString("en-US")}`;
}

/**
 * Claim free and registration tickets. Paid tiers stay disabled until online
 * payment exists. Guests can see the tiers; claiming sends them to sign in.
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
  const [claimed, setClaimed] = useState<number | null>(null);
  const { error, pending, perform } = useMemberAction();

  const chosen = tiers
    .map((tier) => ({ tierId: tier.id, quantity: quantities[tier.id] ?? 0 }))
    .filter((item) => item.quantity > 0);
  const total = chosen.reduce((sum, item) => sum + item.quantity, 0);
  const anyClaimable = tiers.some((tier) => claimableCount(tier) > 0);

  function change(tier: Tier, delta: number) {
    const next = (quantities[tier.id] ?? 0) + delta;
    setQuantities({
      ...quantities,
      [tier.id]: Math.min(Math.max(next, 0), claimableCount(tier)),
    });
  }

  async function submit() {
    const result = await perform(() => claimTickets(slug, chosen));
    if (result.ok) {
      setClaimed(result.data);
      setQuantities({});
      router.refresh();
    }
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
                  {priceText(tier)}
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
        disabled={pending || total === 0}
        onClick={submit}
        size="lg"
        title={anyClaimable ? undefined : PAID_NOTE}
      >
        <Ticket data-icon="inline-start" />
        {total > 0
          ? `Get ${total} ticket${total === 1 ? "" : "s"}`
          : "Get tickets"}
      </Button>
      {claimed === null ? null : (
        <p
          className="flex items-center gap-1 text-body text-primary"
          role="status"
        >
          <Check className="size-4" />
          You have {claimed} new ticket{claimed === 1 ? "" : "s"}.{" "}
          <Link className="underline" href="/me/tickets">
            Open My tickets
          </Link>
        </p>
      )}
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
