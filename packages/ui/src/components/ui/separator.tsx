import { cn } from "@grenmet/ui/lib/utils";
import type * as React from "react";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-orientation is only set when role="separator"; static analysis cannot see the conditional exclusivity
    <div
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      data-orientation={orientation}
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      {...props}
    />
  );
}

export { Separator };
