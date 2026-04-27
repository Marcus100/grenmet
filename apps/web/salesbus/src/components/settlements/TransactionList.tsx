"use client";

import type { CaseType, Transaction } from "@/lib/types";
import { formatCaseType, formatPrice } from "@/lib/types";

interface TransactionListProps {
  showTotal?: boolean;
  transactions: Transaction[];
}

export interface TransactionItem {
  caseType: CaseType;
  id: string;
  price: number;
  productId: string;
  productImage: string;
  productName: string;
  quantity: number;
}

export function TransactionList({
  transactions,
  showTotal = true,
}: TransactionListProps) {
  const total = transactions.reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="flex flex-col">
      {transactions.map((transaction) => (
        <div
          className="border-gray-200 border-b py-4 last:border-b-0 sm:py-5"
          key={transaction.id}
        >
          {transaction.items.map((item) => (
            <div
              className="flex items-center justify-between py-2 sm:py-3"
              key={item.id}
            >
              <div className="mr-4 min-w-0 flex-1">
                <h4 className="truncate font-bold text-[var(--color-text-primary)] text-base tracking-wide sm:text-lg">
                  {item.productName}
                </h4>
                <p className="text-[var(--color-text-secondary)] text-sm sm:text-base">
                  {item.quantity} {formatCaseType(item.caseType)}
                </p>
              </div>
              <span className="flex-shrink-0 font-bold text-[var(--color-text-primary)] text-lg sm:text-xl">
                {formatPrice(item.price)}
              </span>
            </div>
          ))}
        </div>
      ))}

      {showTotal && transactions.length > 0 && (
        <div className="mt-2 flex items-center justify-between border-gray-300 border-t pt-4 sm:pt-5">
          <span className="font-bold text-[var(--color-text-primary)] text-lg sm:text-xl">
            TOTAL
          </span>
          <span className="font-bold text-[var(--color-primary)] text-xl sm:text-2xl">
            {formatPrice(total)}
          </span>
        </div>
      )}
    </div>
  );
}
