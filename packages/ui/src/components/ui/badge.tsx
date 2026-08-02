import { cn } from "@barrelsgd/ui/lib/utils";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-4xl border border-transparent px-2 py-0.5 font-medium text-xs transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
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
        // Status — light variants
        // TODO(boundary-4): gm-surface-panel has no semantic equivalent yet.
        "light-primary": "border-transparent bg-gm-surface-panel text-gm-navy",
        "light-success":
          "border-transparent bg-success text-success-foreground",
        "light-error":
          "border-transparent bg-destructive text-destructive-foreground",
        // TODO(boundary-4): yellow is the CAP caution level, not the UI warning
        // colour used everywhere else (amber). Resolving it changes appearance,
        // so it is deliberately left on the brand token here.
        "light-warning":
          "border-transparent bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
        // TODO(boundary-4): sky-on-dark-text differs from every other info
        // surface, which is blue-on-inverse. Same reason as above.
        "light-info": "border-transparent bg-gm-sky text-gm-text-primary",
        "light-light": "border-transparent bg-muted text-foreground",
        "light-dark": "border-transparent bg-primary text-primary-foreground",
        // Status — solid variants
        "solid-primary":
          "border-transparent bg-primary text-primary-foreground",
        "solid-success":
          "border-transparent bg-success text-success-foreground",
        "solid-error":
          "border-transparent bg-destructive text-destructive-foreground",
        "solid-warning":
          "border-transparent bg-warning text-warning-foreground",
        "solid-info": "border-transparent bg-info text-info-foreground",
        "solid-light": "border-transparent bg-muted text-foreground",
        "solid-dark": "border-transparent bg-primary text-primary-foreground",
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
