"use client";

import { TransactionSummaryCard } from "@/components/salesbus/settlements";
import { getTransactionSummary } from "@/lib/salesbus/mock-data";

export default function SettlementsPage() {
  const summary = getTransactionSummary();

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-5">
      {/* Card grid - single column on portrait, 2 columns on landscape */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 landscape:grid-cols-2">
        <TransactionSummaryCard
          amount={summary.all}
          date={summary.date}
          href="/salesbus/settlements/transactions"
          title="ALL TRANSACTION"
        />

        <TransactionSummaryCard
          amount={summary.cash}
          date={summary.date}
          href="/salesbus/settlements/transactions?type=cash"
          title="CASH TRANSACTION"
        />

        <TransactionSummaryCard
          amount={summary.credit}
          date={summary.date}
          href="/salesbus/settlements/customers"
          title="CREDIT TRANSACTION"
        />
      </div>
    </div>
  );
}
