"use client";

import { DollarSign } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DateNavigator, TransactionList } from "@/components/settlements";
import { Button } from "@/components/ui";
import {
  getCustomerBalance,
  getCustomerById,
  getTransactionsByCustomer,
} from "@/src/lib/mock-data";
import { formatPrice } from "@/src/lib/types";

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const [currentDate, setCurrentDate] = useState("2025-01-21");

  const customer = getCustomerById(customerId);
  const balance = getCustomerBalance(customerId);
  const transactions = getTransactionsByCustomer(customerId);

  // Filter transactions by date
  const filteredTransactions = transactions.filter(
    (t) => t.date === currentDate,
  );

  const handlePreviousDate = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    setCurrentDate(date.toISOString().split("T")[0]);
  };

  const handleNextDate = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    setCurrentDate(date.toISOString().split("T")[0]);
  };

  if (!customer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-[var(--color-text-secondary)] text-base sm:text-lg">
          Customer not found
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:gap-5 sm:p-5">
      {/* Customer name header */}
      <div className="rounded-xl bg-gray-200 p-4 sm:p-5">
        <h1 className="text-center font-bold text-[var(--color-text-primary)] text-lg tracking-wide sm:text-xl">
          {customer.name}
        </h1>
      </div>

      {/* Balance summary */}
      <div className="rounded-xl bg-[var(--color-surface)] p-4 sm:p-5">
        <div className="flex items-center justify-between border-gray-100 border-b py-3">
          <span className="font-medium text-[var(--color-text-primary)] text-base sm:text-lg">
            Total
          </span>
          <span className="font-bold text-[var(--color-text-primary)] text-lg sm:text-xl">
            {formatPrice(balance.totalOwed)}
          </span>
        </div>
        <div className="flex items-center justify-between border-gray-100 border-b py-3">
          <span className="font-medium text-[var(--color-text-primary)] text-base sm:text-lg">
            Amount Payed
          </span>
          <span className="font-bold text-[var(--color-success)] text-lg sm:text-xl">
            +{formatPrice(balance.totalPaid)}
          </span>
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="font-medium text-[var(--color-text-primary)] text-base sm:text-lg">
            Current Amount Owed
          </span>
          <span className="font-bold text-[var(--color-primary)] text-lg sm:text-xl">
            {formatPrice(balance.currentBalance)}
          </span>
        </div>
      </div>

      {/* Add Payment button */}
      <Button
        className="flex items-center justify-center gap-2"
        fullWidth
        size="lg"
        variant="primary"
      >
        <DollarSign className="h-5 w-5" />
        ADD PAYMENT
      </Button>

      {/* Date navigator */}
      <DateNavigator
        date={currentDate}
        onNext={handleNextDate}
        onPrevious={handlePreviousDate}
      />

      {/* Transaction list */}
      <div className="rounded-xl bg-[var(--color-surface)] p-4 sm:p-5">
        {filteredTransactions.length > 0 ? (
          <TransactionList transactions={filteredTransactions} />
        ) : (
          <p className="py-6 text-center text-[var(--color-text-secondary)] text-base sm:text-lg">
            No transactions for this date
          </p>
        )}
      </div>
    </div>
  );
}
