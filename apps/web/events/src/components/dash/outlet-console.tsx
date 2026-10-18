"use client";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import {
  closeTill,
  openTill,
  refundTicket,
  sellOutletTickets,
} from "@/data/actions";
import { formatMoney, money, parseMinor } from "@/domain/money";
import type { CurrencyCode, Outlet, Till } from "@/domain/types";
import { formatTime } from "@/lib/datetime";

function newKey(): string {
  return globalThis.crypto.randomUUID();
}

function amount(minor: number, currency: CurrencyCode): string {
  return formatMoney(money(minor, currency));
}

/**
 * Outlet cash sales: the organiser's own staff open a till, sell tickets for
 * cash against the shared inventory, print the slips and close the till with a
 * count. Settlement compares that count with what the till should hold.
 */
export function OutletConsole({ outlet }: { outlet: Outlet }) {
  const currency = outlet.tiers[0]?.currency ?? "XCD";
  const { till } = outlet;
  return (
    <div className="space-y-6">
      <section
        aria-label="Stock"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {outlet.tiers.map((tier) => (
          <div className="rounded-xl border bg-card px-4 py-3" key={tier.id}>
            <p className="font-medium text-body">{tier.name}</p>
            <p className="text-caption text-muted-foreground">
              {amount(tier.priceMinor, tier.currency)}
            </p>
            <p className="mt-1 font-bold font-display text-heading-sm tabular-nums">
              {tier.remaining}
              <span className="font-normal text-caption text-muted-foreground">
                {" "}
                left of {tier.allocation}
              </span>
            </p>
          </div>
        ))}
      </section>

      <TillPanel currency={currency} outlet={outlet} till={till} />

      {till?.status === "open" && outlet.selling ? (
        <SaleForm currency={currency} outlet={outlet} />
      ) : null}

      <SalesList currency={currency} outlet={outlet} />

      <RefundPanel currency={currency} outlet={outlet} />
    </div>
  );
}

function TillPanel({
  currency,
  outlet,
  till,
}: {
  currency: CurrencyCode;
  outlet: Outlet;
  till: Till | null;
}) {
  const router = useRouter();
  const { error, pending, perform } = useMemberAction();
  const [floatText, setFloatText] = useState("0");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");

  if (!till) {
    const minor = parseMinor(floatText);
    return (
      <section
        aria-labelledby="till-heading"
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <h2
          className="font-display font-semibold text-heading-sm"
          id="till-heading"
        >
          Open your till
        </h2>
        {outlet.selling ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (minor === null) {
                return;
              }
              const result = await perform(() =>
                openTill(outlet.listingId, minor)
              );
              if (result.ok) {
                router.refresh();
              }
            }}
          >
            <Field className="w-40">
              <FieldLabel htmlFor="till-float">Opening float</FieldLabel>
              <Input
                id="till-float"
                inputMode="decimal"
                onChange={(event) => setFloatText(event.target.value)}
                value={floatText}
              />
            </Field>
            <Button disabled={pending || minor === null} type="submit">
              Open till
            </Button>
          </form>
        ) : (
          <p className="text-body text-muted-foreground">
            Tickets can't be sold for this event.
          </p>
        )}
        <FormError error={error} />
      </section>
    );
  }

  const countedMinor = parseMinor(counted);
  return (
    <section
      aria-labelledby="till-heading"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="font-display font-semibold text-heading-sm"
          id="till-heading"
        >
          Your till
        </h2>
        <Badge variant={till.status === "open" ? "light-success" : "outline"}>
          {till.status === "open" ? "Open" : "Closed"}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-body sm:grid-cols-4">
        <Figure
          label="Opening float"
          value={amount(till.openingFloatMinor, currency)}
        />
        <Figure
          label={`Sold (${till.ticketsSold} tickets)`}
          value={amount(till.collectedMinor, currency)}
        />
        <Figure
          label="Should hold"
          value={amount(till.expectedMinor, currency)}
        />
        {till.countedMinor === null ? null : (
          <Figure label="Counted" value={amount(till.countedMinor, currency)} />
        )}
      </dl>
      {till.status === "closed" && till.differenceMinor !== null ? (
        <p
          className={
            till.differenceMinor === 0
              ? "font-medium text-body text-primary"
              : "font-medium text-body text-destructive"
          }
          role="status"
        >
          {till.differenceMinor === 0
            ? "Counted cash matches."
            : `${till.differenceMinor < 0 ? "Short" : "Over"} by ${amount(Math.abs(till.differenceMinor), currency)}.`}
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2 border-t pt-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (countedMinor === null) {
              return;
            }
            const result = await perform(() =>
              closeTill(outlet.listingId, countedMinor, note)
            );
            if (result.ok) {
              router.refresh();
            }
          }}
        >
          <Field className="w-40">
            <FieldLabel htmlFor="till-counted">Cash counted</FieldLabel>
            <Input
              id="till-counted"
              inputMode="decimal"
              onChange={(event) => setCounted(event.target.value)}
              value={counted}
            />
          </Field>
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="till-note">Note (optional)</FieldLabel>
            <Input
              id="till-note"
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </Field>
          <Button
            disabled={pending || countedMinor === null}
            type="submit"
            variant="outline"
          >
            Close till
          </Button>
        </form>
      )}
      <FormError error={error} />
    </section>
  );
}

function SaleForm({
  currency,
  outlet,
}: {
  currency: CurrencyCode;
  outlet: Outlet;
}) {
  const router = useRouter();
  const { error, pending, perform } = useMemberAction();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [collected, setCollected] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [key, setKey] = useState(newKey);

  const items = outlet.tiers
    .map((tier) => ({ tierId: tier.id, quantity: quantities[tier.id] ?? 0 }))
    .filter((item) => item.quantity > 0);
  const total = outlet.tiers.reduce(
    (sum, tier) => sum + (quantities[tier.id] ?? 0) * tier.priceMinor,
    0
  );
  const collectedMinor = parseMinor(collected);
  const ready = items.length > 0 && collectedMinor === total;

  return (
    <section
      aria-labelledby="sale-heading"
      className="space-y-4 rounded-xl border bg-card p-4"
    >
      <h2
        className="font-display font-semibold text-heading-sm"
        id="sale-heading"
      >
        Sell tickets
      </h2>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!ready || collectedMinor === null) {
            return;
          }
          const result = await perform(() =>
            sellOutletTickets(outlet.listingId, {
              items,
              amountCollectedMinor: collectedMinor,
              buyerName,
              buyerPhone,
              idempotencyKey: key,
            })
          );
          if (result.ok) {
            setKey(newKey());
            setQuantities({});
            setCollected("");
            setBuyerName("");
            setBuyerPhone("");
            router.push(
              `/dash/events/${outlet.listingId}/outlet/${result.data.orderId}`
            );
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {outlet.tiers.map((tier) => (
            <Field key={tier.id}>
              <FieldLabel htmlFor={`qty-${tier.id}`}>
                {tier.name} ({amount(tier.priceMinor, tier.currency)})
              </FieldLabel>
              <Input
                id={`qty-${tier.id}`}
                inputMode="numeric"
                max={tier.remaining}
                min={0}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  setQuantities((current) => ({
                    ...current,
                    [tier.id]: Number.isNaN(next) ? 0 : Math.max(next, 0),
                  }));
                }}
                type="number"
                value={quantities[tier.id] ?? 0}
              />
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="buyer-name">Buyer name (optional)</FieldLabel>
            <Input
              id="buyer-name"
              maxLength={120}
              onChange={(event) => setBuyerName(event.target.value)}
              value={buyerName}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="buyer-phone">
              Buyer phone (optional)
            </FieldLabel>
            <Input
              id="buyer-phone"
              inputMode="tel"
              maxLength={40}
              onChange={(event) => setBuyerPhone(event.target.value)}
              value={buyerPhone}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cash-collected">
              Cash received (due {amount(total, currency)})
            </FieldLabel>
            <Input
              id="cash-collected"
              inputMode="decimal"
              onChange={(event) => setCollected(event.target.value)}
              value={collected}
            />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={pending || !ready} type="submit">
            Sell and print
          </Button>
          {items.length > 0 && collectedMinor !== total ? (
            <p className="text-caption text-muted-foreground">
              Enter exactly {amount(total, currency)} to continue.
            </p>
          ) : null}
        </div>
        <FormError error={error} />
      </form>
    </section>
  );
}

function SalesList({
  currency,
  outlet,
}: {
  currency: CurrencyCode;
  outlet: Outlet;
}) {
  return (
    <section aria-labelledby="sales-heading" className="space-y-3">
      <h2
        className="font-display font-semibold text-heading-sm"
        id="sales-heading"
      >
        Recent outlet sales
      </h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-body">
          <thead className="border-b text-caption text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Tickets</th>
              <th className="px-3 py-2 font-medium">Cash</th>
              <th className="px-3 py-2 font-medium">Sold by</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Print</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {outlet.sales.map((sale) => (
              <tr key={sale.orderId}>
                <td className="px-3 py-2">{formatTime(sale.createdAt)}</td>
                <td className="px-3 py-2">{sale.buyerName ?? "Walk-up"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {sale.tickets.length}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {amount(sale.collectedMinor, currency)}
                </td>
                <td className="px-3 py-2">{sale.soldByName ?? "Staff"}</td>
                <td className="px-3 py-2">
                  <Link
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    href={`/dash/events/${outlet.listingId}/outlet/${sale.orderId}`}
                  >
                    <Printer className="size-4" />
                    Slip
                  </Link>
                </td>
              </tr>
            ))}
            {outlet.sales.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-6 text-center text-muted-foreground"
                  colSpan={6}
                >
                  No outlet sales yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  return error ? (
    <p className="text-body text-destructive" role="alert">
      {error}
    </p>
  ) : null;
}

/**
 * Manual refunds for outlet cash tickets: the organiser hands back cash or
 * makes a bank transfer, then records it here. A refunded ticket can no
 * longer be admitted and its place goes back on sale.
 */
function RefundPanel({
  currency,
  outlet,
}: {
  currency: CurrencyCode;
  outlet: Outlet;
}) {
  const rows = outlet.sales.flatMap((sale) =>
    sale.tickets.map((ticket) => ({ sale, ticket }))
  );
  const refundable = rows.filter(({ ticket }) => ticket.canRefund);
  const refunded = rows.filter(({ ticket }) => ticket.refund !== null);
  if (refundable.length === 0 && refunded.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="refund-heading" className="space-y-3">
      <h2
        className="font-display font-semibold text-heading-sm"
        id="refund-heading"
      >
        Refunds
      </h2>
      <ul className="divide-y rounded-xl border bg-card">
        {refundable.map(({ sale, ticket }) => (
          <RefundRow
            buyer={sale.buyerName}
            currency={currency}
            key={ticket.id}
            listingId={outlet.listingId}
            ticket={ticket}
          />
        ))}
        {refunded.map(({ ticket }) =>
          ticket.refund ? (
            <li
              className="flex flex-wrap items-center gap-2 px-4 py-2 text-body"
              key={ticket.id}
            >
              <Badge variant="outline">Refunded</Badge>
              <span className="font-mono tracking-wider">{ticket.code}</span>
              <span className="tabular-nums">
                {amount(ticket.refund.amountMinor, currency)} by{" "}
                {ticket.refund.method}
                {ticket.refund.reference ? ` (${ticket.refund.reference})` : ""}
              </span>
              <span className="text-caption text-muted-foreground">
                {ticket.refund.refundedByName ?? "Staff"} at{" "}
                {formatTime(ticket.refund.refundedAt)}
              </span>
            </li>
          ) : null
        )}
      </ul>
    </section>
  );
}

function RefundRow({
  buyer,
  currency,
  listingId,
  ticket,
}: {
  buyer: string | null;
  currency: CurrencyCode;
  listingId: string;
  ticket: Outlet["sales"][number]["tickets"][number];
}) {
  const router = useRouter();
  const { error, pending, perform } = useMemberAction();
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [value, setValue] = useState((ticket.priceMinor / 100).toFixed(2));
  const [reference, setReference] = useState("");
  const minor = parseMinor(value);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-body">
        <span className="font-mono tracking-wider">{ticket.code}</span>
        <span>
          {ticket.tierName} · {amount(ticket.priceMinor, currency)}
        </span>
        <span className="text-caption text-muted-foreground">
          {buyer ?? "Walk-up"}
        </span>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (minor === null || minor === 0) {
            return;
          }
          const result = await perform(() =>
            refundTicket(listingId, ticket.id, {
              amountMinor: minor,
              method,
              reference,
            })
          );
          if (result.ok) {
            router.refresh();
          }
        }}
      >
        <div className="flex gap-1">
          <Button
            aria-pressed={method === "cash"}
            onClick={() => setMethod("cash")}
            size="sm"
            type="button"
            variant={method === "cash" ? "default" : "outline"}
          >
            Cash
          </Button>
          <Button
            aria-pressed={method === "bank"}
            onClick={() => setMethod("bank")}
            size="sm"
            type="button"
            variant={method === "bank" ? "default" : "outline"}
          >
            Bank
          </Button>
        </div>
        <Field className="w-28">
          <FieldLabel htmlFor={`refund-amount-${ticket.id}`}>Amount</FieldLabel>
          <Input
            id={`refund-amount-${ticket.id}`}
            inputMode="decimal"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
        </Field>
        <Field className="min-w-40 flex-1">
          <FieldLabel htmlFor={`refund-ref-${ticket.id}`}>
            {method === "bank" ? "Bank reference" : "Reference (optional)"}
          </FieldLabel>
          <Input
            id={`refund-ref-${ticket.id}`}
            maxLength={120}
            onChange={(event) => setReference(event.target.value)}
            value={reference}
          />
        </Field>
        <Button
          disabled={pending || minor === null || minor === 0}
          type="submit"
          variant="outline"
        >
          Record refund
        </Button>
      </form>
      <FormError error={error} />
    </li>
  );
}
