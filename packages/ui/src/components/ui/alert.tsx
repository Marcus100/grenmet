import { cn } from "@grenmet/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-gm-8 border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive:
          "border-gm-warning-red-border bg-gm-warning-red-bg text-gm-warning-red-fg *:data-[slot=alert-description]:text-current [&>svg]:text-current",
        success:
          "border-gm-warning-green-border bg-gm-warning-green-bg text-gm-warning-green-fg *:data-[slot=alert-description]:text-current [&>svg]:text-current",
        warning:
          "border-gm-warning-amber-border bg-gm-warning-amber-bg text-gm-warning-amber-fg *:data-[slot=alert-description]:text-current [&>svg]:text-current",
        error:
          "border-gm-warning-red-border bg-gm-warning-red-bg text-gm-warning-red-fg *:data-[slot=alert-description]:text-current [&>svg]:text-current",
        info: "border-gm-blue bg-gm-surface text-gm-navy *:data-[slot=alert-description]:text-gm-text-secondary [&>svg]:text-gm-blue",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className
      )}
      data-slot="alert-title"
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm [&_p]:leading-relaxed",
        className
      )}
      data-slot="alert-description"
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
