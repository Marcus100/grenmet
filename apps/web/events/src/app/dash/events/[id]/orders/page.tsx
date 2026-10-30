import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { OrderList } from "@/components/dash/order-list";
import {
  OrgForbidden,
  OrgUnavailable,
} from "@/components/dash/org-unavailable";
import { getManagedOrganiser } from "@/data/events-api";
import { resolveOrgContext } from "@/data/org-context";
import { getOrgOrders } from "@/data/org-orders";
import { requireViewer } from "@/data/viewer";
import { isOrderStatus, pageParam } from "@/lib/org-orders";

/** Orders are live and per-organiser; never prerender them. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await requireViewer(`/dash/events/${id}/orders`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const event = managed.listings.find((listing) => listing.id === id);
  if (!event) {
    notFound();
  }
  const context = await resolveOrgContext();
  const result = context.ok
    ? await getOrgOrders(context, id, {
        page: pageParam(query.page),
        ...(isOrderStatus(query.status) ? { status: query.status } : {}),
      })
    : null;
  if (result?.kind === "not-found") {
    notFound();
  }
  const orders = result?.kind === "ok" ? result.value : null;

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
            href={`/dash/events/${id}`}
          >
            ← {event.title}
          </Link>
          <h1 className="font-display text-heading-base font-semibold">
            Orders
          </h1>
        </div>
        {orders ? (
          <OrderList
            count={orders.count}
            listingId={id}
            page={orders.page}
            rows={orders.rows}
            status={isOrderStatus(query.status) ? query.status : undefined}
            totalPages={orders.totalPages}
          />
        ) : (
          fallback
        )}
      </main>
    </DashShell>
  );
}
