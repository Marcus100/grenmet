import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { OrderActions } from "@/components/dash/order-actions";
import { OrderDetail } from "@/components/dash/order-detail";
import { OrgUnavailable } from "@/components/dash/org-unavailable";
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
  const order = context.ok ? await getOrgOrder(context, orderId) : null;
  // The order must belong to the event in the URL, not just to the organisation.
  if (context.ok && (!order || order.listing_id !== id)) {
    notFound();
  }

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
            className="inline-flex min-h-11 items-center text-caption text-muted-foreground hover:underline"
            href={`/dash/events/${id}/orders`}
          >
            ← Orders
          </Link>
          <h1 className="font-display font-semibold text-heading-base">
            {order?.buyer_name ?? "Order"}
          </h1>
        </div>
        {order ? (
          <>
            <OrderDetail order={order} />
            <OrderActions order={order} />
          </>
        ) : (
          <OrgUnavailable />
        )}
      </main>
    </DashShell>
  );
}
