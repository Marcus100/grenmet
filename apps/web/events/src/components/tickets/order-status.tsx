"use client";

import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Check, Clock, RotateCcw, TimerOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { MyOrder } from "@/domain/types";
import { formatTime } from "@/lib/datetime";
import {
  formatCountdown,
  formatPrice,
  msUntil,
  safeCheckoutUrl,
} from "@/lib/orders";

/** How often the page asks the server for the order while it waits for money. */
export const POLL_MS = 5000;
const TICK_MS = 1000;

function Panel({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="border-border bg-card space-y-3 rounded-2xl border p-6">
      <h2 className="font-display text-heading-sm flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function LinkButton({
  children,
  listingSlug,
  primary = true,
}: {
  children: ReactNode;
  /** Link to this event's page; without it the button opens My tickets. */
  listingSlug?: string;
  primary?: boolean;
}) {
  return (
    <Link
      className={cn(
        buttonVariants({ variant: primary ? "default" : "outline" }),
        "h-11"
      )}
      href={listingSlug ? `/events/${listingSlug}` : "/me/tickets"}
    >
      {children}
    </Link>
  );
}

/**
 * Shows where a ticket order stands. While it waits for payment the page
 * re-renders from the server every few seconds (the member's token never
 * reaches the browser, so the browser cannot call the API itself) and a
 * countdown runs to the end of the hold. The status sits in a polite live
 * region so a screen reader hears it change.
 */
export function OrderStatus({ order }: { order: MyOrder }) {
  const router = useRouter();
  const pending = order.status === "pending_payment";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pending) {
      return;
    }
    const poll = setInterval(() => router.refresh(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [pending, router]);

  const checkoutUrl = safeCheckoutUrl(order.checkoutUrl);
  const remaining = msUntil(order.paymentExpiresAt, now);
  const total = formatPrice(order.total);

  return (
    <div className="space-y-4" role="status">
      {order.status === "pending_payment" ? (
        <Panel
          icon={<Clock className="text-primary size-5" />}
          title="Awaiting payment"
        >
          <p className="text-body">
            {total} · your tickets are reserved
            {order.paymentExpiresAt
              ? ` until ${formatTime(order.paymentExpiresAt)}`
              : ""}
            .
          </p>
          {order.paymentExpiresAt ? (
            <p className="text-body text-muted-foreground">
              {remaining > 0 ? (
                <>
                  Time left{" "}
                  <span
                    aria-hidden="true"
                    className="text-foreground font-mono font-semibold tabular-nums"
                  >
                    {formatCountdown(remaining)}
                  </span>
                </>
              ) : (
                "The hold has ended. Checking for your payment…"
              )}
            </p>
          ) : null}
          {checkoutUrl ? (
            <a
              className={cn(buttonVariants({ variant: "default" }), "h-11")}
              href={checkoutUrl}
            >
              Continue to payment
            </a>
          ) : (
            <p className="text-body text-muted-foreground">
              Pay the organiser before the hold ends. They record your payment
              and your tickets appear here and in My tickets. This page updates
              by itself.
            </p>
          )}
        </Panel>
      ) : null}
      {order.status === "confirmed" ? (
        <Panel
          icon={<Check className="text-primary size-5" />}
          title="Payment received"
        >
          <p className="text-body">
            {order.ticketIds.length} ticket
            {order.ticketIds.length === 1 ? "" : "s"} confirmed ({total}).
          </p>
          <LinkButton>Open My tickets</LinkButton>
        </Panel>
      ) : null}
      {order.status === "expired" ? (
        <Panel
          icon={<TimerOff className="text-destructive size-5" />}
          title="This order expired"
        >
          <p className="text-body text-muted-foreground">
            The hold ran out before payment arrived, so the tickets went back on
            sale and you have not been charged. If a payment was in flight it is
            refunded in full.
          </p>
          <LinkButton listingSlug={order.listingSlug}>Try again</LinkButton>
        </Panel>
      ) : null}
      {order.status === "refunded" ? (
        <Panel
          icon={<RotateCcw className="text-muted-foreground size-5" />}
          title="This order was refunded"
        >
          <p className="text-body text-muted-foreground">
            {total} was refunded and the tickets no longer work. Refunds can
            take a few days to reach your card.
          </p>
          <LinkButton listingSlug={order.listingSlug} primary={false}>
            Back to the event
          </LinkButton>
        </Panel>
      ) : null}
    </div>
  );
}
