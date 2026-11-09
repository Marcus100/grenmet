import { Button } from "@barrelsgd/ui/components/ui/button";
import type { ReactNode } from "react";

/**
 * Sticky bottom bar of a product form: status chips, the blocking-problem
 * count (which moves focus to the error summary) and the form actions. It sits
 * at the end of the editor card so it stays in view while the form scrolls.
 */
export function ProductActionBar({
  status,
  problemCount,
  onShowProblems,
  children,
}: {
  status: ReactNode;
  problemCount: number;
  onShowProblems: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Product actions"
      className="bg-card sticky bottom-0 z-10 -mx-4 mt-2 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
      data-slot="product-action-bar"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {status}
        {problemCount ? (
          <Button
            onClick={onShowProblems}
            size="sm"
            type="button"
            variant="destructive"
          >
            {problemCount === 1 ? "1 problem" : `${problemCount} problems`}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}
