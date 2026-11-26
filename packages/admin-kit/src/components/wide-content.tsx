import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Marks a data-heavy page (a register, a roster, a wide table) to use the full
 * screen width even when the content layout preference is "centred". The shell
 * lifts its centred cap for any main area that contains this marker; reading
 * pages stay centred.
 */
export function WideContent({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("w-full min-w-0", className)} data-content-width="wide">
      {children}
    </div>
  );
}
