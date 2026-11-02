import { cn } from "@barrelsgd/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";

function ArrowIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" {...props}>
      <path
        d="m11.5 6.5 3 3.5m0 0-3 3.5m3-3.5h-9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const variantStyles = {
  primary:
    "rounded-full bg-zinc-900 py-1 px-3 text-white hover:bg-zinc-700 dark:bg-gm-sky/10 dark:text-gm-sky dark:ring-1 dark:ring-inset dark:ring-gm-sky/20 dark:hover:bg-gm-blue/10 dark:hover:text-white dark:hover:ring-gm-blue",
  secondary:
    "rounded-full bg-zinc-100 py-1 px-3 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:ring-1 dark:ring-inset dark:ring-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-300",
  filled:
    "rounded-full bg-zinc-900 py-1 px-3 text-white hover:bg-zinc-700 dark:bg-gm-blue-ink dark:text-white dark:hover:bg-gm-blue",
  outline:
    "rounded-full py-1 px-3 text-zinc-700 ring-1 ring-inset ring-zinc-900/10 hover:bg-zinc-900/2.5 hover:text-zinc-900 dark:text-zinc-400 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-white",
  text: "text-gm-blue-ink hover:text-gm-navy dark:text-gm-sky dark:hover:text-white",
};

// Every docs page is served by one optional catch-all route, so typed routes
// cannot check these paths; the href is a plain string, cast once below.
type ButtonProps = {
  variant?: keyof typeof variantStyles;
  arrow?: "left" | "right";
} & (
  | (Omit<React.ComponentPropsWithoutRef<typeof Link>, "href"> & {
      href: string;
    })
  | (React.ComponentPropsWithoutRef<"button"> & { href?: undefined })
);

export function Button({
  variant = "primary",
  className,
  children,
  arrow,
  ...props
}: ButtonProps) {
  className = cn(
    "inline-flex justify-center gap-0.5 overflow-hidden text-sm font-medium transition",
    variantStyles[variant],
    className
  );

  const arrowIcon = (
    <ArrowIcon
      className={cn(
        "mt-0.5 h-5 w-5",
        variant === "text" && "relative top-px",
        arrow === "left" && "-ml-1 rotate-180",
        arrow === "right" && "-mr-1"
      )}
    />
  );

  const inner = (
    <>
      {arrow === "left" && arrowIcon}
      {children}
      {arrow === "right" && arrowIcon}
    </>
  );

  if (typeof props.href === "undefined") {
    return (
      <button className={className} {...props}>
        {inner}
      </button>
    );
  }

  return (
    <Link className={className} {...props} href={props.href as Route}>
      {inner}
    </Link>
  );
}
