import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The picture card above the tabs. Now and every forecast day use this one
 * layout, so each tab has the same four rows (when and where, the big
 * temperature, the sky in words, one more figure) and the card never changes
 * height as the tab changes. A row with nothing to say keeps its space.
 */
export function SummaryCard({
  condition,
  conditionPlaceholder,
  label,
  numeral,
  scene,
  secondary,
  title,
}: {
  /** The sky in words, or null when nothing is reported. */
  condition: string | null;
  /** Shown, muted, in place of a missing sky word. */
  conditionPlaceholder: string;
  /** First row: an icon and a line such as "Observed 20:00 · MBIA". */
  label: ReactNode;
  /** The big temperature, sized by the caller; supplies its own screen-reader text. */
  numeral: ReactNode;
  /** The sky scene on the right. */
  scene: ReactNode;
  /** Last row, such as "Feels like 26°" or "Min 25.5°"; null keeps the space. */
  secondary: ReactNode;
  /** A heading above the label, used only by the compact card. */
  title?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="grid min-w-0 content-start gap-0.5">
        {title && (
          <span className="text-body-base leading-body-base lg:text-heading-sm lg:leading-heading-sm font-bold">
            {title}
          </span>
        )}
        {/* Two lines tall whether the label wraps or not. */}
        <span className="text-body-sm text-gm-text-inverse/85 leading-body-sm flex min-h-[2lh] min-w-0 items-start gap-1">
          {label}
        </span>
        <div className="mt-1">{numeral}</div>
        <span
          className={cn(
            "text-body-base leading-body-base lg:text-heading-sm lg:leading-heading-sm min-h-[1lh] truncate",
            condition ? "font-bold" : "text-gm-text-inverse/70"
          )}
        >
          {condition ?? conditionPlaceholder}
        </span>
        <span className="text-body-sm text-gm-text-inverse/85 leading-body-sm min-h-[1lh]">
          {secondary ?? " "}
        </span>
      </div>
      {scene}
    </div>
  );
}
