import { cn } from "@grenmet/ui/lib/utils";
import type { ReactNode } from "react";

/** US Letter at 96dpi. The fixed pixel size the paper renders at; DocumentPreview
 *  scales it down to fit, print CSS forces it back to 8.5in × 11in. */
export const PAPER_WIDTH = 816;
export const PAPER_HEIGHT = 1056;
export const PAPER_SCALE = 0.6;

/**
 * A fixed-size document "page" — both the live preview surface and the print
 * target (`data-print-paper`). Wrap each document's content in this.
 */
export function Paper({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("bg-white text-zinc-900 shadow-sm", className)}
      data-print-paper
      style={{ width: PAPER_WIDTH, height: PAPER_HEIGHT }}
    >
      {children}
    </div>
  );
}
