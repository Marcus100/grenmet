"use client";

import Link from "next/link";
import type { CustomerBalance } from "@/src/lib/types";
import { formatPrice } from "@/src/lib/types";

interface CustomerCardProps {
  customer: CustomerBalance;
  showBalance?: boolean;
}

export function CustomerCard({
  customer,
  showBalance = true,
}: CustomerCardProps) {
  return (
    <Link
      className="flex min-h-16 touch-manipulation items-center justify-between rounded-xl bg-[var(--color-surface)] p-4 transition-all hover:shadow-md active:bg-gray-50 sm:p-5"
      href={`/settlements/customers/${customer.customerId}`}
    >
      <h3 className="font-bold text-[var(--color-text-primary)] text-base tracking-wide sm:text-lg">
        {customer.customerName}
      </h3>

      {showBalance && customer.currentBalance > 0 && (
        <span className="font-bold text-[var(--color-error)] text-base sm:text-lg">
          -{formatPrice(customer.currentBalance)}
        </span>
      )}
    </Link>
  );
}
