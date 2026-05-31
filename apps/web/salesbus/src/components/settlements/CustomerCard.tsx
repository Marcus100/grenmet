"use client";

import Link from "next/link";
import type { CustomerBalance } from "@/lib/types";
import { formatPrice } from "@/lib/types";

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
      className="flex min-h-16 touch-manipulation items-center justify-between rounded-xl bg-card p-4 transition-all hover:shadow-gm-card active:bg-gray-50 sm:p-5"
      href={`/settlements/customers/${customer.customerId}`}
    >
      <h3 className="font-bold text-base text-foreground tracking-wide sm:text-lg">
        {customer.customerName}
      </h3>

      {showBalance && customer.currentBalance > 0 && (
        <span className="font-bold text-base text-destructive sm:text-lg">
          -{formatPrice(customer.currentBalance)}
        </span>
      )}
    </Link>
  );
}
