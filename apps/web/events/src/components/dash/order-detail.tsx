import type { OrgOrderDetail } from "@barrelsgd/api-client";
import { formatEventDate } from "@/lib/datetime";
import {
  formatOrderMoneyCode,
  humanise,
  orderBadge,
  PAYMENT_METHOD_LABEL,
  refundStatus,
  ticketStatus,
} from "@/lib/org-orders";
import { StatusBadge } from "./status-badge";

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4">
      <h2 className="font-display font-semibold text-heading-sm">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-body text-muted-foreground">{label}</dt>
      <dd className="text-body tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One order: buyer contact, line items, tickets and the payment ledger totals.
 * `buyer_email` is sent only to admins and owners, so null reads as "not
 * shown", never as "the buyer has no email".
 */
export function OrderDetail({ order }: { order: OrgOrderDetail }) {
  const money = (minor: number) => formatOrderMoneyCode(minor, order.currency);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={orderBadge(order)} />
        <StatusBadge status={refundStatus(order.refund_status)} />
        <span className="text-caption text-muted-foreground">
          {PAYMENT_METHOD_LABEL[order.payment_method]} ·{" "}
          {order.channel === "online" ? "Sold online" : "Sold at the outlet"}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Buyer">
          <dl className="space-y-1">
            <Row label="Name" value={order.buyer_name ?? "Not given"} />
            <Row label="Phone" value={order.buyer_phone ?? "Not given"} />
            <Row
              label="Email"
              value={order.buyer_email ?? "No account email to show"}
            />
            <Row label="Placed" value={formatEventDate(order.created_at)} />
            <Row
              label="Paid"
              value={order.paid_at ? formatEventDate(order.paid_at) : "Not yet"}
            />
            {order.payment_expires_at ? (
              <Row
                label="Hold ends"
                value={formatEventDate(order.payment_expires_at)}
              />
            ) : null}
          </dl>
        </Section>
        <Section title={`Money (${order.currency})`}>
          <dl className="space-y-1">
            <Row label="Order total" value={money(order.total_minor)} />
            <Row label="Collected" value={money(order.collected_minor)} />
            <Row label="Refunded" value={money(order.refunded_minor)} />
            <Row
              label={
                order.refund_status === "queued"
                  ? "Still refundable (a refund is pending)"
                  : "Still refundable"
              }
              value={money(order.payment?.refundable_minor ?? 0)}
            />
            {order.payment ? (
              <Row
                label="Payment"
                value={`${humanise(order.payment.provider)} · ${humanise(order.payment.status)}`}
              />
            ) : (
              <Row label="Payment" value="No online payment" />
            )}
          </dl>
        </Section>
      </div>
      <Section title="Items">
        {order.items.length === 0 ? (
          <p className="text-body text-muted-foreground" role="status">
            No items on this order.
          </p>
        ) : (
          <ul className="divide-y">
            {order.items.map((item) => (
              <li
                className="flex flex-wrap justify-between gap-2 py-2 text-body"
                key={item.tier_id}
              >
                <span>
                  {item.quantity} × {item.tier_name}
                </span>
                <span className="tabular-nums">
                  {money(item.unit_price_minor * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Tickets">
        {order.tickets.length === 0 ? (
          <p className="text-body text-muted-foreground" role="status">
            No tickets issued yet. They are issued when the order is paid.
          </p>
        ) : (
          <ul className="divide-y">
            {order.tickets.map((ticket) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-body"
                key={ticket.id}
              >
                <span>
                  {ticket.tier_name} ·{" "}
                  <span className="font-mono tracking-wider">
                    {ticket.code}
                  </span>
                  {ticket.admitted_at
                    ? ` · admitted ${formatEventDate(ticket.admitted_at)}`
                    : ""}
                </span>
                <StatusBadge status={ticketStatus(ticket.status)} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
