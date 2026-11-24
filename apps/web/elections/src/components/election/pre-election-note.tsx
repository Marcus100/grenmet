import Link from "next/link";
import { ProvisionalSource } from "@/components/election/declared-result";
import { declaredResult } from "@/data/election-2026";
import { campaign, results } from "@/data/load";

/**
 * Sits at the top of pages built before polling day (the forecast, the map
 * tool). Renders nothing until the result is declared; then it says the page
 * is the pre-election outlook, kept as history, and states the provisional
 * result beside it. Nothing here depends on today's date.
 */
export function PreElectionNote() {
  const declared = declaredResult(results, campaign);
  if (!declared) return null;
  return (
    <aside
      aria-label="Pre-election outlook"
      className="border-el-ink bg-el-paper-2 mx-auto mb-2 max-w-[1240px] border-l-4 px-4 py-3 sm:px-6"
    >
      <p className="text-el-ink-2 text-base leading-relaxed">
        <b className="text-el-ink font-semibold">
          Pre-election outlook, kept as history.
        </b>{" "}
        This page was built before the 5 November 2026 election; its figures are
        not updated for the result. The provisional result:{" "}
        {declared.seats.map(([party, count]) => `${party} ${count}`).join(", ")}{" "}
        seats of 15. See the{" "}
        <Link className="underline underline-offset-4" href="/2026#results">
          result in each constituency
        </Link>
        .
      </p>
      <ProvisionalSource className="text-el-muted mt-1 text-base leading-relaxed" />
    </aside>
  );
}
