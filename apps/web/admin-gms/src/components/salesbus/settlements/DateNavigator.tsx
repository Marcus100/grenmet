"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/salesbus/types";

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
    <div className="flex items-center justify-between rounded-xl bg-card p-2">
      <button
        aria-label="Previous date"
        className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
        onClick={onPrevious}
        type="button"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <span className="font-medium text-base text-foreground sm:text-lg">
        {formatDate(date)}
      </span>

      <button
        aria-label="Next date"
        className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
        onClick={onNext}
        type="button"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}
