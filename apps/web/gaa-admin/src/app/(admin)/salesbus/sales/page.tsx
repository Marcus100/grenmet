import type { Metadata } from "next";
import { NoAccess } from "@/components/salesbus/NoAccess";
import { RequisitionBuilder } from "@/components/salesbus/sales/RequisitionBuilder";
import { TransactionList } from "@/components/salesbus/settlements";
import {
  getCatalogue,
  getLocations,
  getRequisitions,
  getStoresAccessOrNull,
} from "@/db/stores/queries";

export const metadata: Metadata = { title: "Stores requisition" };

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const access = await getStoresAccessOrNull();
  if (!access) return <NoAccess />;

  const [items, mine, submitted, locations] = await Promise.all([
    access.can_request
      ? getCatalogue({ activeOnly: true })
      : Promise.resolve([]),
    getRequisitions({ mine: true }),
    access.can_approve
      ? getRequisitions({ statuses: ["SUBMITTED"] })
      : Promise.resolve(null),
    access.can_manage ? getLocations() : Promise.resolve([]),
  ]);
  const drafts = mine.data.filter(
    (requisition) => requisition.status === "DRAFT"
  );
  const raised = mine.data.filter(
    (requisition) => requisition.status !== "DRAFT"
  );
  const toApprove =
    submitted?.data.filter((requisition) => requisition.can_approve) ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-4 sm:p-5">
      {access.can_request ? (
        <RequisitionBuilder items={items} />
      ) : (
        <p className="text-muted-foreground text-sm">
          You can view the stores but not raise requisitions.
        </p>
      )}

      {toApprove.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground text-lg">
            Awaiting your approval
          </h2>
          <TransactionList locations={locations} requisitions={toApprove} />
        </section>
      ) : null}

      {drafts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground text-lg">Your drafts</h2>
          <TransactionList locations={locations} requisitions={drafts} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground text-lg">
          Your requisitions
        </h2>
        <TransactionList
          emptyMessage="You have not raised a requisition yet"
          locations={locations}
          requisitions={raised}
        />
      </section>
    </div>
  );
}
