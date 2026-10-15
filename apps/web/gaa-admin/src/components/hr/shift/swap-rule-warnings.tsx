"use client";

import { useHrCheckShiftSwapRules } from "@barrelsgd/api-client";
import { TriangleAlert } from "lucide-react";

const RULE_TITLE: Record<string, string> = {
  MIN_REST: "Short rest between shifts",
  MAX_CONSECUTIVE_DAYS: "Too many consecutive days",
  MAX_WEEKLY_HOURS: "Weekly hours over limit",
};

interface SwapRuleWarningsProps {
  swapId: string;
}

/**
 * Warn-only: rule breaches this exchange would introduce for the two employees.
 * Renders nothing when no limits are set, nothing is breached, or the viewer is
 * not allowed to see the check; it never blocks approval.
 */
export function SwapRuleWarnings({ swapId }: SwapRuleWarningsProps) {
  const check = useHrCheckShiftSwapRules({ path: { shift_swap_id: swapId } });
  const violations = check.data?.violations ?? [];
  if (violations.length === 0) return null;

  return (
    <section
      aria-label="Exchange rule warnings"
      className="mt-2 rounded-lg border border-gm-risk-amber/40 bg-gm-risk-amber/10 px-3 py-2 font-normal text-xs"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert className="size-3.5" />
        This exchange would breach {violations.length} roster{" "}
        {violations.length === 1 ? "rule" : "rules"}
      </p>
      <ul className="mt-1 text-muted-foreground">
        {violations.map((v) => (
          <li key={`${v.code}-${v.user_id}-${v.start_date}`}>
            {RULE_TITLE[v.code] ?? v.code} · {v.start_date} · {v.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
