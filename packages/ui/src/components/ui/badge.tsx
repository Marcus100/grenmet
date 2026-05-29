import { Slot } from "@grenmet/ui/lib/slot";
import { cn } from "@grenmet/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-gm-full border px-2.5 py-0.5 font-medium text-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-gm-warning-red-bg text-gm-warning-red-fg focus-visible:ring-destructive/20 [a&]:hover:bg-gm-warning-red-bg/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // Light variants
        "light-primary": "border-transparent bg-gm-surface-panel text-gm-navy",
        "light-success":
          "border-transparent bg-gm-warning-green-bg text-gm-warning-green-fg",
        "light-error":
          "border-transparent bg-gm-warning-red-bg text-gm-warning-red-fg",
        "light-warning":
          "border-transparent bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
        "light-info": "border-transparent bg-gm-sky text-gm-text-primary",
        "light-light":
          "border-transparent bg-gm-surface-muted text-gm-text-primary",
        "light-dark": "border-transparent bg-gm-navy text-gm-text-inverse",
        // Solid variants
        "solid-primary":
          "border-transparent bg-primary text-primary-foreground",
        "solid-success":
          "border-transparent bg-gm-warning-green-bg text-gm-warning-green-fg",
        "solid-error":
          "border-transparent bg-gm-warning-red-bg text-gm-warning-red-fg",
        "solid-warning":
          "border-transparent bg-gm-warning-amber-bg text-gm-warning-amber-fg",
        "solid-info": "border-transparent bg-gm-blue text-gm-text-inverse",
        "solid-light":
          "border-transparent bg-gm-surface-muted text-gm-text-primary",
        "solid-dark": "border-transparent bg-gm-navy text-gm-text-inverse",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      {...props}
    />
  );
}

export { Badge, badgeVariants };
