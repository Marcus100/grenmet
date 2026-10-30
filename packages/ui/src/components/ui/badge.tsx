import { cn } from "@barrelsgd/ui/lib/utils";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "group/badge focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:ring-[3px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // Status — light variants. These map to the soft status tier, which is
        // the lower-emphasis filled treatment; the solid variants below use the
        // full-strength tier.
        "light-primary":
          "bg-primary-soft text-primary-soft-foreground border-transparent",
        "light-success":
          "bg-success text-success-foreground border-transparent",
        "light-error":
          "bg-destructive text-destructive-foreground border-transparent",
        "light-warning":
          "bg-warning-soft text-warning-soft-foreground border-transparent",
        "light-info":
          "bg-info-soft text-info-soft-foreground border-transparent",
        "light-light": "bg-muted text-foreground border-transparent",
        "light-dark": "bg-primary text-primary-foreground border-transparent",
        // Status — solid variants
        "solid-primary":
          "bg-primary text-primary-foreground border-transparent",
        "solid-success":
          "bg-success text-success-foreground border-transparent",
        "solid-error":
          "bg-destructive text-destructive-foreground border-transparent",
        "solid-warning":
          "bg-warning text-warning-foreground border-transparent",
        "solid-info": "bg-info text-info-foreground border-transparent",
        "solid-light": "bg-muted text-foreground border-transparent",
        "solid-dark": "bg-primary text-primary-foreground border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
