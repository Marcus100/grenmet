import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { OrderActions } from "@/components/dash/order-actions";
import { OrderDetail } from "@/components/dash/order-detail";
import {
  OrgForbidden,
  OrgUnavailable,
} from "@/components/dash/org-unavailable";
import { getManagedOrganiser } from "@/data/events-api";
import { resolveOrgContext } from "@/data/org-context";
import { getOrgOrder } from "@/data/org-orders";
import { requireViewer } from "@/data/viewer";

/** An order is live money state; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  const { id, orderId } = await params;
  await requireViewer(`/dash/events/${id}/orders/${orderId}`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const event = managed.listings.find((listing) => listing.id === id);
  if (!event) {
    notFound();
  }
  const context = await resolveOrgContext();
  const result = context.ok ? await getOrgOrder(context, orderId) : null;
  // The order must belong to the event in the URL, not just to the organisation.
  if (
    result?.kind === "not-found" ||
    (result?.kind === "ok" && result.value.listing_id !== id)
  ) {
    notFound();
  }
  const order = result?.kind === "ok" ? result.value : null;

  const fallback =
    result?.kind === "forbidden" ? (
      <OrgForbidden what="orders" />
    ) : (
      <OrgUnavailable />
    );

  return (
    <DashShell
      active="events"
      currentOrganiser={managed.organiser.slug}
      eventName={event.title}
      isDemo={false}
      organisers={managed.organisers}
    >
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            className="text-caption text-muted-foreground inline-flex min-h-11 items-center hover:underline"
            href={`/dash/events/${id}/orders`}
          >
            ← Orders
          </Link>
          <h1 className="font-display text-heading-base font-semibold">
            {order?.buyer_name ?? "Order"}
          </h1>
        </div>
        {order ? (
          <>
            <OrderDetail order={order} />
            <OrderActions order={order} />
          </>
        ) : (
          fallback
        )}
      </main>
    </DashShell>
  );
}
