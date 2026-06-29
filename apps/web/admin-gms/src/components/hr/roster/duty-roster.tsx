"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { cn } from "@grenmet/ui/lib/utils";
import { ChevronLeft, ChevronRight, Printer, RotateCcw } from "lucide-react";
import { useState } from "react";

const STAFF = [
  "G. Tamar",
  "J. Charles",
  "V. Cyrus",
  "F. Frank",
  "K. Johnson",
  "N. Jones",
  "T. Miller",
  "J. Pryce",
  "E. White",
  "K. Bedeau",
  "K. Clarke",
  "S. Cummings",
  "J. Fleming",
  "Z. Barry",
  "G. Charles",
  "T. Mitchell",
  "T. Tekal",
  "J. McLeod",
  "S. Paterson",
];

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

// Empty first so the first click assigns the first real shift; cycles on re-click.
const CODES = ["", "M", "E", "N", "D", "O", "V", "S", "L"];

const CODE_STYLE: Record<string, string> = {
  M: "bg-primary/10 text-primary",
  E: "bg-primary/10 text-primary",
  N: "bg-primary/10 text-primary",
  D: "bg-accent/15 text-accent-foreground",
  O: "bg-muted text-muted-foreground",
  V: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  S: "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  L: "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
};

const LEGEND: { code: string; label: string }[] = [
  { code: "M", label: "0530–1400 hrs" },
  { code: "E", label: "1400–2230 hrs" },
  { code: "N", label: "2230–0600 hrs" },
  { code: "D", label: "0800–1600 hrs" },
  { code: "O", label: "Off duty" },
  { code: "V", label: "Vacation" },
  { code: "S", label: "Study leave" },
  { code: "L", label: "Leave (other)" },
];

export function DutyRoster() {
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month, i + 1);
    return {
      day: i + 1,
      weekday: WEEKDAY[date.getDay()],
      isSunday: date.getDay() === 0,
    };
  });
  const monthLabel = monthDate.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  function cycle(name: string, day: number) {
    const key = `${name}|${day}`;
    setAssignments((cur) => {
      const idx = CODES.indexOf(cur[key] ?? "");
      return { ...cur, [key]: CODES[(idx + 1) % CODES.length] };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => shiftMonth(-1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center font-medium text-lg">
            {monthLabel}
          </span>
          <Button
            onClick={() => shiftMonth(1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAssignments({})}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw data-icon="inline-start" />
            Clear
          </Button>
          <Button
            onClick={() => window.print()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Printer data-icon="inline-start" />
            Print
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
        {LEGEND.map((item) => (
          <span className="flex items-center gap-1.5" key={item.code}>
            <span
              className={cn(
                "inline-flex size-4 items-center justify-center rounded-sm font-medium text-[10px]",
                CODE_STYLE[item.code]
              )}
            >
              {item.code}
            </span>
            {item.label}
          </span>
        ))}
        <span className="text-muted-foreground/70">
          Click a cell to cycle shifts.
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-center text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th
                className="sticky left-0 z-10 w-40 border-border border-r bg-muted/50 px-2 py-1.5 text-left font-semibold"
                rowSpan={2}
              >
                Name
              </th>
              {days.map((d) => (
                <th
                  className={cn(
                    "w-7 border-border border-l py-0.5 font-medium",
                    d.isSunday && "text-destructive"
                  )}
                  key={`wk-${d.day}`}
                >
                  {d.weekday}
                </th>
              ))}
            </tr>
            <tr>
              {days.map((d) => (
                <th
                  className={cn(
                    "border-border border-t border-l py-0.5 font-semibold",
                    d.isSunday && "text-destructive"
                  )}
                  key={`day-${d.day}`}
                >
                  {d.day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAFF.map((name) => (
              <tr className="border-border border-t" key={name}>
                <td className="sticky left-0 z-10 border-border border-r bg-background px-2 py-1 text-left font-medium">
                  {name}
                </td>
                {days.map((d) => {
                  const code = assignments[`${name}|${d.day}`] ?? "";
                  return (
                    <td
                      className="border-border border-l p-0"
                      key={`${name}-${d.day}`}
                    >
                      <button
                        className={cn(
                          "h-6 w-full font-medium text-[11px] leading-none outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          code && CODE_STYLE[code]
                        )}
                        onClick={() => cycle(name, d.day)}
                        type="button"
                      >
                        {code}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
