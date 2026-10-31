"use client";

import { useHrCheckShiftSwapRules } from "@barrelsgd/api-client";
import { TriangleAlert } from "lucide-react";
import { ruleTitle } from "../roster/rule-codes";

interface SwapRuleWarningsProps {
  swapId: string;
}

/**
 * Roster rule breaches this exchange would introduce for the two employees,
 * including short notice (#380). Approving with breaches needs a reason. Shows a
 * plain line when nothing is breached; shows nothing to viewers who may not see
 * the check.
 */
export function SwapRuleWarnings({ swapId }: SwapRuleWarningsProps) {
  const check = useHrCheckShiftSwapRules({ path: { shift_swap_id: swapId } });
  if (check.isError) return null;
  const violations = check.data?.violations ?? [];
  if (check.isPending || violations.length === 0) {
    return (
      <p className="mt-2 font-normal text-muted-foreground text-xs">
        {check.isPending
          ? "Checking roster rules…"
          : "No roster rule breaches from this exchange."}
      </p>
    );
  }

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
            {ruleTitle(v.code)} · {v.start_date} · {v.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
