import type { Metadata } from "next";
import { NoAccess } from "@/components/salesbus/NoAccess";
import { TransactionSummaryCard } from "@/components/salesbus/settlements";
import { getRequisitions, getStoresAccessOrNull } from "@/db/stores/queries";
import { AWAITING_DELIVERY } from "@/lib/salesbus/types";

export const metadata: Metadata = { title: "Stores deliveries" };

export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  const access = await getStoresAccessOrNull();
  if (!access) return <NoAccess />;

  const [awaiting, delivered, all] = await Promise.all([
    getRequisitions({ statuses: AWAITING_DELIVERY }),
    getRequisitions({ statuses: ["DELIVERED"] }),
    getRequisitions(),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-5">
      {/* Card grid - single column on portrait, 2 columns on landscape */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 landscape:grid-cols-2">
        <TransactionSummaryCard
          count={awaiting.count}
          href="/salesbus/settlements/transactions?status=APPROVED&status=PARTIALLY_DELIVERED"
          subtitle="Approved, waiting for the stores"
          title="AWAITING DELIVERY"
        />

        <TransactionSummaryCard
          count={delivered.count}
          href="/salesbus/settlements/transactions?status=DELIVERED"
          subtitle="Fully delivered"
          title="DELIVERED"
        />

        <TransactionSummaryCard
          count={all.count}
          href="/salesbus/settlements/transactions"
          subtitle="Every requisition you can see"
          title="ALL REQUISITIONS"
        />
      </div>
    </div>
  );
}
