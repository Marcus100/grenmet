import type { OrgOrderRow } from "@barrelsgd/api-client";
import Link from "next/link";
import { formatEventDate } from "@/lib/datetime";
import {
  formatOrderMoneyCode,
  ORDER_STATUSES,
  orderBadge,
  orderStatus,
  PAYMENT_METHOD_LABEL,
} from "@/lib/org-orders";
import { FilterLinks, Pager } from "./list-controls";
import { StatusBadge } from "./status-badge";

/**
 * An event's orders, newest first. One card layout serves phone and desktop;
 * the filter and pager are links so the page stays a Server Component.
 */
export function OrderList({
  count,
  listingId,
  page,
  rows,
  status,
  totalPages,
}: {
  count: number;
  listingId: string;
  page: number;
  rows: readonly OrgOrderRow[];
  status: OrgOrderRow["status"] | undefined;
  totalPages: number;
}) {
  const basePath = `/dash/events/${listingId}/orders`;
  const params = { status };
  return (
    <div className="space-y-4">
      <FilterLinks
        basePath={basePath}
        current={status}
        label="Filter orders by status"
        options={[
          { label: "All", value: undefined },
          ...ORDER_STATUSES.map((value) => ({
            label: orderStatus(value).label,
            value,
          })),
        ]}
        param="status"
        params={{}}
      />
      {rows.length === 0 ? (
        <p
          className="bg-card text-body text-muted-foreground rounded-2xl border border-dashed px-4 py-8 text-center"
          role="status"
        >
          {status
            ? `No ${orderStatus(status).label.toLowerCase()} orders on this event yet.`
            : "No orders on this event yet. Orders appear here as people buy tickets."}
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-2xl border">
          {rows.map((order) => (
            <li key={order.id}>
              <Link
                className="hover:bg-muted grid min-h-11 gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
                href={`/dash/events/${listingId}/orders/${order.id}`}
              >
                <span>
                  <span className="text-body block font-medium">
                    {order.buyer_name ?? "Buyer without a name"}
                  </span>
                  <span className="text-caption text-muted-foreground block">
                    {formatEventDate(order.created_at)} ·{" "}
                    {PAYMENT_METHOD_LABEL[order.payment_method]} ·{" "}
                    {order.active_ticket_count} of {order.ticket_count} tickets
                    valid
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="font-medium tabular-nums">
                    {formatOrderMoneyCode(order.total_minor, order.currency)}
                  </span>
                  <StatusBadge status={orderBadge(order)} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager
        basePath={basePath}
        count={count}
        page={page}
        params={params}
        totalPages={totalPages}
      />
    </div>
  );
}
