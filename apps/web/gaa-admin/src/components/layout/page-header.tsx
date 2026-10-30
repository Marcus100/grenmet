import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Title block for every portal page. One title style (`text-2xl`, semibold,
 * tight tracking) and one description style. Actions sit on the right on wide
 * screens and wrap underneath on phones.
 */
export function PageHeader({
  actions,
  className,
  description,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
