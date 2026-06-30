"use client";

import { format } from "date-fns";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { CalenderIcon } from "../../icons";
import Label from "./Label";

interface DatePickerProps {
  defaultDate?: Date;
  id: string;
  label?: string;
  mode?: "single" | "range" | "multiple";
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
}

export default function DatePicker({
  id,
  label,
  defaultDate,
  placeholder,
  onChange,
}: DatePickerProps) {
  const [selected, setSelected] = useState<Date | undefined>(defaultDate);
  const [open, setOpen] = useState(false);

  function handleSelect(date: Date | undefined) {
    setSelected(date);
    onChange?.(date);
    setOpen(false);
  }

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        <button
          className="h-11 w-full appearance-none rounded-lg border border-border bg-transparent px-4 py-2.5 text-left text-foreground text-sm shadow-gm-card focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20"
          id={id}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span
            className={selected ? "text-foreground" : "text-muted-foreground"}
          >
            {selected
              ? format(selected, "yyyy-MM-dd")
              : (placeholder ?? "Pick a date")}
          </span>
        </button>
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
          <CalenderIcon className="size-6" />
        </span>
        {open && (
          <div className="absolute z-50 mt-1 rounded-lg border border-border bg-white shadow-lg">
            <DayPicker
              mode="single"
              onSelect={handleSelect}
              selected={selected}
            />
          </div>
        )}
      </div>
    </div>
  );
}
