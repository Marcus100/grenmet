"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Calendar } from "@barrelsgd/ui/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@barrelsgd/ui/components/ui/popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDays, formatDateForUrl, getTodayUTC } from "@/lib/wxwatch/utils";

interface DateNavigationProps {
  currentDate: Date;
}

/** Gallery dates are UTC calendar days, so the calendar renders and returns the
 *  same Y/M/D in local time — never the browser's shifted instant. */
function toLocalDate(utcDate: Date): Date {
  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate()
  );
}

function toUtcDate(localDate: Date): Date {
  return new Date(
    Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate())
  );
}

export function DateNavigation({ currentDate }: DateNavigationProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selected = toLocalDate(currentDate);
  const isToday =
    formatDateForUrl(currentDate) === formatDateForUrl(getTodayUTC());

  const goToDate = (date: Date) => {
    router.push(formatDateForUrl(date));
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label="Previous day"
        onClick={() => goToDate(addDays(currentDate, -1))}
        size="icon"
        variant="outline"
      >
        <ChevronLeft />
      </Button>

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              className="w-50 justify-between font-normal"
              variant="outline"
            >
              {selected.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              <CalendarIcon className="text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            defaultMonth={selected}
            mode="single"
            onSelect={(date) => {
              if (!date) {
                return;
              }
              setOpen(false);
              goToDate(toUtcDate(date));
            }}
            selected={selected}
          />
        </PopoverContent>
      </Popover>

      <Button
        aria-label="Next day"
        disabled={isToday}
        onClick={() => goToDate(addDays(currentDate, 1))}
        size="icon"
        variant="outline"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
