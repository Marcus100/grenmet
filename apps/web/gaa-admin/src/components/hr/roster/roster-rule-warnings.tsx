"use client";

import { useHrCheckPeriodRules } from "@barrelsgd/api-client";
import { TriangleAlert } from "lucide-react";

const RULE_TITLE: Record<string, string> = {
  MIN_REST: "Short rest between shifts",
  MAX_CONSECUTIVE_DAYS: "Too many consecutive days",
  MAX_WEEKLY_HOURS: "Weekly hours over limit",
};

interface RosterRuleWarningsProps {
  /** Display names keyed by user id, from the department member list. */
  labels: ReadonlyMap<string, string>;
  periodId: string;
}

/**
 * Warn-only: lists breaches of the department's rest, consecutive-day and
 * weekly-hour limits. It never blocks saving or publishing, and renders nothing
 * when no limits are configured or nothing is breached.
 */
export function RosterRuleWarnings({
  periodId,
  labels,
}: RosterRuleWarningsProps) {
  const check = useHrCheckPeriodRules({ path: { period_id: periodId } });
  const violations = check.data?.violations ?? [];
  if (violations.length === 0) return null;

  return (
    <section
      aria-label="Roster rule warnings"
      className="rounded-xl border border-gm-risk-amber/40 bg-gm-risk-amber/10 px-4 py-3 text-sm"
    >
      <h2 className="flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4" />
        {violations.length} roster rule{" "}
        {violations.length === 1 ? "warning" : "warnings"}
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-muted-foreground text-xs">
        {violations.map((v) => (
          <li key={`${v.code}-${v.user_id}-${v.start_date}`}>
            <span className="font-medium text-foreground">
              {labels.get(v.user_id) ?? "Unknown staff"}
            </span>{" "}
            · {RULE_TITLE[v.code] ?? v.code} · {v.start_date}
            {v.end_date === v.start_date ? "" : ` to ${v.end_date}`} ·{" "}
            {v.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
