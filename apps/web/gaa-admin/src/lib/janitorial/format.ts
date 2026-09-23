// Display helpers for the FastAPI janitorial catalogue (`/api/v1/janitorial/spec`).
// Parsing and seeding live in FastAPI (`scripts/seed_catalogues.py`).

/** Human-readable cadence, e.g. "2×/day", "3×/5 days", "1×/15 mins". */
export function formatFrequency(freq: {
  count: number;
  periodValue: number;
  periodUnit: string;
}): string {
  const unit = freq.periodUnit === "minute" ? "min" : "day";
  const period = freq.periodValue === 1 ? unit : `${freq.periodValue} ${unit}s`;
  return `${freq.count}×/${period}`;
}
