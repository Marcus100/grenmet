"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Calendar } from "@grenmet/ui/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@grenmet/ui/components/ui/popover";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

function parseDateValue(value: string) {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Popover + Calendar date field. Value/onChange are ISO `yyyy-MM-dd` strings, so
 *  it drops straight into a TanStack `form.Field`. */
export function DatePicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = parseDateValue(value);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="w-full justify-between text-left font-normal data-[empty=true]:text-muted-foreground"
            data-empty={!date}
            id={id}
            variant="outline"
          />
        }
      >
        {date ? format(date, "PPP") : <span>Pick a date</span>}
        <CalendarIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Calendar
          className="w-full"
          defaultMonth={date}
          mode="single"
          onSelect={(selectedDate) => {
            if (!selectedDate) {
              return;
            }
            onChange(format(selectedDate, "yyyy-MM-dd"));
            setOpen(false);
          }}
          selected={date}
        />
      </PopoverContent>
    </Popover>
  );
}
