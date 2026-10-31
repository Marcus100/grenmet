"use client";

import { useHrCheckPeriodRules } from "@barrelsgd/api-client";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { ruleTitle, violationDates } from "./rule-codes";

interface RosterRuleWarningsProps {
  /** Display names keyed by user id, from the department member list. */
  labels: ReadonlyMap<string, string>;
  periodId: string;
}

/**
 * Roster rule breaches in this month (#380). Publishing or changing a published
 * roster with breaches needs a supervisor's reason. Always shown, including when
 * nothing is breached, so reviewers can see the check ran.
 */
export function RosterRuleWarnings({
  periodId,
  labels,
}: RosterRuleWarningsProps) {
  const check = useHrCheckPeriodRules({ path: { period_id: periodId } });
  const violations = check.data?.violations ?? [];

  if (check.isPending) {
    return (
      <p
        className="rounded-xl border px-4 py-3 text-muted-foreground text-sm"
        role="status"
      >
        Checking roster rules…
      </p>
    );
  }
  if (check.isError) {
    return (
      <p className="rounded-xl border px-4 py-3 text-sm" role="alert">
        Roster rules could not be checked. Refresh to retry.
      </p>
    );
  }
  if (violations.length === 0) {
    return (
      <section
        aria-label="Roster rule warnings"
        className="flex items-center gap-2 rounded-xl border px-4 py-3 text-muted-foreground text-sm"
      >
        <CircleCheck className="size-4 text-gm-risk-green" />
        No roster rule warnings this month. Staff not covered by the union
        agreement are not checked.
      </section>
    );
  }

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
      <p className="mt-1 text-muted-foreground text-xs">
        Publishing needs a reason while these remain. The reason is recorded.
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-muted-foreground text-xs">
        {violations.map((v) => (
          <li key={`${v.code}-${v.user_id}-${v.start_date}-${v.end_date}`}>
            <span className="font-medium text-foreground">
              {labels.get(v.user_id) ?? "Unknown staff"}
            </span>{" "}
            · {ruleTitle(v.code)} · {violationDates(v)} · {v.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
