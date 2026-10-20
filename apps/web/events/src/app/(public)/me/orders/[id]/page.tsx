import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatus } from "@/components/tickets/order-status";
import { getMyOrder } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false },
};

export default async function OrderPage({ params }: { params: Params }) {
  const { id } = await params;
  await requireViewer(`/me/orders/${id}`);
  const order = await getMyOrder(id);
  if (!order) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link
        className="text-body text-muted-foreground underline"
        href="/me/tickets"
      >
        All my tickets
      </Link>
      <h1 className="font-bold font-display text-heading-base tracking-tight">
        Your order
      </h1>
      <OrderStatus order={order} />
    </div>
  );
}
