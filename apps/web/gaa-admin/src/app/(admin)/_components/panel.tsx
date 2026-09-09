import { Card, CardContent } from "@barrelsgd/ui/components/ui/card";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import { cn } from "@barrelsgd/ui/lib/utils";
import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Panel({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <div className="flex items-start justify-between gap-3 px-4 pb-3">
        <div className="min-w-0">
          <h2 className="font-medium text-sm">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-muted-foreground text-xs">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <Link
            className="flex shrink-0 items-center gap-1 rounded-md text-primary text-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            href={action.href}
          >
            {action.label}
            <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

/** Shown in place of a panel body when its source could not be reached. */
export function PanelUnavailable({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-muted-foreground text-xs">
      <TriangleAlert className="size-4 shrink-0" />
      {message}
    </div>
  );
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
      {children}
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="gap-0 py-4">
      <div className="px-4 pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-48" />
      </div>
      <CardContent className="space-y-2 px-4">
        {Array.from({ length: rows }, (_, index) => index).map((index) => (
          <Skeleton className="h-10 w-full" key={index} />
        ))}
      </CardContent>
    </Card>
  );
}
