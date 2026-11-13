import type { LocationPublic, RequisitionPublic } from "@barrelsgd/api-client";
import { RequisitionCard } from "./RequisitionCard";

interface TransactionListProps {
  emptyMessage?: string;
  locations: LocationPublic[];
  requisitions: RequisitionPublic[];
}

export function TransactionList({
  requisitions,
  locations,
  emptyMessage = "No requisitions",
}: TransactionListProps) {
  if (requisitions.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-base sm:text-lg">
        {emptyMessage}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {requisitions.map((requisition) => (
        <RequisitionCard
          key={requisition.id}
          locations={locations}
          requisition={requisition}
        />
      ))}
    </div>
  );
}
