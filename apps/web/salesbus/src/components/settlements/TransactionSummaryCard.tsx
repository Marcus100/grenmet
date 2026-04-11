"use client";

import { Calendar } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/src/lib/types";

interface TransactionSummaryCardProps {
  amount: number;
  date: string;
  href: string;
  title: string;
}

export function TransactionSummaryCard({
  title,
  amount,
  date,
  href,
}: TransactionSummaryCardProps) {
  // Format date to short form (e.g., "Jun 21st")
  const formatShortDate = (dateString: string) => {
    const dateObj = new Date(dateString);
    const month = dateObj.toLocaleDateString("en-US", { month: "short" });
    const day = dateObj.getDate();
    const suffix = getOrdinalSuffix(day);
    return `${month} ${day}${suffix}`;
  };

  function getOrdinalSuffix(day: number): string {
    if (day > 3 && day < 21) return "th";
    switch (day % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#5B9BD5] to-[#3A6BA8] p-5 text-white sm:p-6">
      <div className="mb-2 flex items-start justify-between">
        <h3 className="font-bold text-base uppercase tracking-wide sm:text-lg">
          {title}
        </h3>
        <div className="flex items-center gap-1.5 text-sm text-white/80">
          <Calendar className="h-4 w-4" />
          <span>{formatShortDate(date)}</span>
        </div>
      </div>

      <div className="mb-6 font-bold text-3xl sm:mb-8 sm:text-4xl">
        +{formatPrice(amount)}
      </div>

      <div className="flex justify-end">
        <Link
          className="-mr-4 inline-flex min-h-12 touch-manipulation items-center px-4 text-sm text-white/80 transition-colors hover:text-white"
          href={href}
        >
          See more &gt;
        </Link>
      </div>
    </div>
  );
}
