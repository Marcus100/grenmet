'use client';

import { useRouter } from 'next/navigation';
import { formatDateForUrl, addDays } from '@/lib/utils';

interface DateNavigationProps {
  currentDate: Date;
}

export function DateNavigation({ currentDate }: DateNavigationProps) {
  const router = useRouter();

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = new Date(e.target.value + 'T00:00:00Z');
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
  const dateInputValue = currentDate.toISOString().split('T')[0];

  return (
    <div className="flex items-center gap-3">
      {/* Previous Day Button */}
      <button
        onClick={goToPreviousDay}
        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 font-medium transition-colors"
        aria-label="Previous day"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Date Picker */}
      <div className="relative">
        <input
          type="date"
          value={dateInputValue}
          onChange={handleDateChange}
          className="px-3 py-2 border border-gray-300 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Select date"
        />
      </div>

      {/* Next Day Button */}
      <button
        onClick={goToNextDay}
        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 font-medium transition-colors"
        aria-label="Next day"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

