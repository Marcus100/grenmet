import type { ReactNode } from "react";

/**
 * Keep plots in viewBox units and scale their minimum width with the root font.
 * This preserves label spacing at enlarged text sizes; only the plot scrolls.
 */
export function ChartViewport({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-el-muted text-sm leading-normal">
        If the chart extends beyond the screen, scroll sideways to explore it.
      </p>
      <section
        aria-label="Scrollable chart"
        className="max-w-full overflow-x-auto overscroll-x-contain pb-3"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable plots need keyboard focus for arrow-key scrolling.
        tabIndex={0}
      >
        {children}
      </section>
    </div>
  );
}
