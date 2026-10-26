import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Marks a data-heavy page (register, roster, desks, wide tables) to use the
 * full screen width even when the content layout preference is "centered".
 * The shell lifts its centred cap for any main area containing this marker;
 * reading pages stay centred.
 */
export function WideContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full min-w-0", className)} data-content-width="wide">
      {children}
    </div>
  );
}
