import { requisitionStatus } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/salesbus/NoAccess";
import { TransactionList } from "@/components/salesbus/settlements/TransactionList";
import {
  getLocations,
  getRequisitions,
  getStoresAccessOrNull,
} from "@/db/stores/queries";
import { STATUS_LABELS } from "@/lib/salesbus/types";

export const metadata: Metadata = { title: "Requisitions" };

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const access = await getStoresAccessOrNull();
  if (!access) return <NoAccess />;

  const { status } = await searchParams;
  const known = Object.values(requisitionStatus) as string[];
  const statuses = [status ?? []]
    .flat()
    .filter((value) => known.includes(value));
  const [requisitions, locations] = await Promise.all([
    getRequisitions({ statuses }),
    access.can_manage ? getLocations() : Promise.resolve([]),
  ]);
  const heading =
    statuses.length === 0
      ? "Requisitions"
      : statuses
          .map((value) => STATUS_LABELS[value as keyof typeof STATUS_LABELS])
          .join(" / ");

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <PageHeader title={heading} />
      <TransactionList locations={locations} requisitions={requisitions.data} />
    </div>
  );
}
