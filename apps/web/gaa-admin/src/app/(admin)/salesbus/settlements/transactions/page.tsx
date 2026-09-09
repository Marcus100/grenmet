import { TransactionList } from "@/components/salesbus/settlements/TransactionList";
import { getTransactionsByType, transactions } from "@/lib/salesbus/mock-data";
export const metadata = { title: "Transactions" };
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const rows =
    type === "cash" || type === "credit"
      ? getTransactionsByType(type)
      : transactions;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <h1 className="font-semibold text-2xl">
        {type === "cash" ? "Cash transactions" : "Transactions"}
      </h1>
      <p className="text-muted-foreground text-sm">
        Development example records, matching the existing settlements summary.
      </p>
      <TransactionList transactions={rows} />
    </div>
  );
}
