"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/src/lib/types";

interface DateNavigatorProps {
  date: string;
  onNext: () => void;
  onPrevious: () => void;
}

export function DateNavigator({
  date,
  onPrevious,
  onNext,
}: DateNavigatorProps) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[var(--color-surface)] p-2">
      <button
        aria-label="Previous date"
        className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--color-text-primary)] active:bg-gray-200"
        onClick={onPrevious}
        type="button"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <span className="font-medium text-[var(--color-text-primary)] text-base sm:text-lg">
        {formatDate(date)}
      </span>

      <button
        aria-label="Next date"
        className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--color-text-primary)] active:bg-gray-200"
        onClick={onNext}
        type="button"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}
