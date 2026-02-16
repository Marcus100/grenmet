"use client";

import { useRouter } from "next/navigation";
import { addDays, formatDateForUrl } from "@/lib/utils";

interface DateNavigationProps {
  currentDate: Date;
}

export function DateNavigation({ currentDate }: DateNavigationProps) {
  const router = useRouter();

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = new Date(e.target.value + "T00:00:00Z");
    const url = formatDateForUrl(selectedDate);
    router.push(url);
  };

  const goToPreviousDay = () => {
    const prevDate = addDays(currentDate, -1);
    const url = formatDateForUrl(prevDate);
    router.push(url);
  };

  const goToNextDay = () => {
    const nextDate = addDays(currentDate, 1);
    const url = formatDateForUrl(nextDate);
    router.push(url);
  };

  // Format date for input (YYYY-MM-DD)
  const dateInputValue = currentDate.toISOString().split("T")[0];

  return (
    <div className="flex items-center gap-3">
      {/* Previous Day Button */}
      <button
        aria-label="Previous day"
        className="rounded-md bg-gray-100 px-3 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200"
        onClick={goToPreviousDay}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M15 19l-7-7 7-7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
      </button>

      {/* Date Picker */}
      <div className="relative">
        <input
          aria-label="Select date"
          className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          onChange={handleDateChange}
          type="date"
          value={dateInputValue}
        />
      </div>

      {/* Next Day Button */}
      <button
        aria-label="Next day"
        className="rounded-md bg-gray-100 px-3 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200"
        onClick={goToNextDay}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M9 5l7 7-7 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
      </button>
    </div>
  );
}
