"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Calendar } from "@grenmet/ui/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@grenmet/ui/components/ui/popover";
import { format, subDays } from "date-fns";
import * as React from "react";
import type { DateRange } from "react-day-picker";

interface DateRangePickerProps {
  onChange?: (value: DateRange | undefined) => void;
  value?: DateRange;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalDateRange, setInternalDateRange] = React.useState<
    DateRange | undefined
  >(() => {
    const to = new Date();
    const from = subDays(to, 29);
    return { from, to };
  });
  const dateRange = value ?? internalDateRange;
  let dateRangeLabel = "Select date";

  if (dateRange?.from) {
    dateRangeLabel = format(dateRange.from, "d MMM yyyy");
  }

  if (dateRange?.from && dateRange.to) {
    dateRangeLabel = `${format(dateRange.from, "d MMM yyyy")} - ${format(dateRange.to, "d MMM yyyy")}`;
  }

  const handleDateChange = (nextValue: DateRange | undefined) => {
    if (!value) {
      setInternalDateRange(nextValue);
    }
    onChange?.(nextValue);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button className="font-normal" id="date" variant="outline">
            {dateRangeLabel}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto overflow-hidden p-0">
        <Calendar
          defaultMonth={dateRange?.from}
          mode="range"
          numberOfMonths={2}
          onSelect={handleDateChange}
          selected={dateRange}
        />
      </PopoverContent>
    </Popover>
  );
}
