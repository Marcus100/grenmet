import { Card, CardContent } from "@barrelsgd/ui/components/ui/card";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";

export interface StatTileProps {
  readonly className?: string;
  /** An icon element, for example `<Users />`, shown in a chip. */
  readonly icon?: ReactNode;
  readonly label: string;
  /**
   * The status or change written out ("Up 12% on last week", "2 overdue"). It
   * is always text, so colour is never the only signal.
   */
  readonly status?: string;
  /** "attention" tints the status for something that needs action. The text stays. */
  readonly statusTone?: "attention" | "neutral";
  readonly value: ReactNode;
}

/** A large value with its label and a written status. */
export function StatTile({
  className,
  icon,
  label,
  status,
  statusTone = "neutral",
  value,
}: StatTileProps) {
  return (
    <Card className={cn("w-full", className)} size="sm">
      <CardContent className="flex items-start gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-2xl leading-tight font-semibold tabular-nums">
            {value}
          </p>
          {status ? (
            <p
              className={cn(
                "text-xs",
                statusTone === "attention"
                  ? "text-destructive font-medium"
                  : "text-muted-foreground"
              )}
            >
              {status}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
