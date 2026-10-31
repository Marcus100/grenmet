import type {
  PayItemUnit,
  PayLineKind,
  PayPeriodStatus,
  PayRunKind,
} from "@barrelsgd/api-client";
import type { QueryKey } from "@tanstack/react-query";

export type PayrollBadgeVariant =
  | "outline"
  | "secondary"
  | "light-success"
  | "solid-warning";

export const PERIOD_STATUS: Record<
  PayPeriodStatus,
  { label: string; variant: PayrollBadgeVariant }
> = {
  OPEN: { label: "Open", variant: "outline" },
  IN_REVIEW: { label: "Awaiting approval", variant: "solid-warning" },
  APPROVED: { label: "Approved", variant: "light-success" },
  EXPORTED: { label: "Exported", variant: "secondary" },
  CLOSED: { label: "Closed", variant: "secondary" },
};

export const RUN_LABEL: Record<PayRunKind, string> = {
  REGULAR: "This period",
  ADJUSTMENT: "Corrections to earlier periods",
};

export const LINE_KIND_LABEL: Record<PayLineKind, string> = {
  COMPUTED: "From attendance",
  MANUAL: "Entered by hand",
  REVERSAL: "Reversal",
  REPLACEMENT: "Replacement",
};

/** "8.00 h" for hours, "1" for counts; the API sends quantities as strings. */
export function formatQuantity(quantity: string, unit: PayItemUnit): string {
  const value = Number(quantity);
  if (Number.isNaN(value)) {
    return quantity;
  }
  return unit === "HOURS" ? `${value.toFixed(2)} h` : value.toFixed(0);
}

export function formatDay(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function periodLabel(period: {
  start_date: string;
  end_date: string;
}): string {
  return `${formatDay(period.start_date)} to ${formatDay(period.end_date)}`;
}

/** First day of the month after ``day`` (yyyy-mm-dd), for the next period. */
export function nextMonthStart(day: string): string {
  const [year, month] = day.split("-").map(Number);
  if (!(year && month)) {
    return "";
  }
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  return `${next[0]}-${String(next[1]).padStart(2, "0")}-01`;
}

/** The day after ``day`` (yyyy-mm-dd), for the next fortnightly period. */
export function dayAfter(day: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

/** Every payroll query, so one action refreshes totals, lines and lists. */
export function isPayrollQuery(queryKey: QueryKey): boolean {
  const [head] = queryKey;
  return (
    typeof head === "object" &&
    head !== null &&
    "url" in head &&
    typeof head.url === "string" &&
    head.url.startsWith("/api/v1/hr/payroll")
  );
}
