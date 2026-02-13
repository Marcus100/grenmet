import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2.5 py-0.5 font-medium text-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // Light variants
        "light-primary":
          "border-transparent bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400",
        "light-success":
          "border-transparent bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
        "light-error":
          "border-transparent bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
        "light-warning":
          "border-transparent bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400",
        "light-info":
          "border-transparent bg-blue-light-50 text-blue-light-500 dark:bg-blue-light-500/15 dark:text-blue-light-500",
        "light-light":
          "border-transparent bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80",
        "light-dark":
          "border-transparent bg-gray-500 text-white dark:bg-white/5 dark:text-white",
        // Solid variants
        "solid-primary":
          "border-transparent bg-brand-500 text-white dark:text-white",
        "solid-success":
          "border-transparent bg-success-500 text-white dark:text-white",
        "solid-error":
          "border-transparent bg-error-500 text-white dark:text-white",
        "solid-warning":
          "border-transparent bg-warning-500 text-white dark:text-white",
        "solid-info":
          "border-transparent bg-blue-light-500 text-white dark:text-white",
        "solid-light":
          "border-transparent bg-gray-400 text-white dark:bg-white/5 dark:text-white/80",
        "solid-dark":
          "border-transparent bg-gray-700 text-white dark:text-white",
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
