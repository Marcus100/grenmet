import { cn } from "@barrelsgd/ui/lib/utils";

/** The id every app puts on its `<main>` so `SkipLink` has a target. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * "Skip to content" link (WCAG 2.4.1 Bypass Blocks). Render it as the first
 * child of `<body>`; it stays visually hidden until focused by keyboard, then
 * appears top-left above the header. Pair with
 * `<main id={MAIN_CONTENT_ID} tabIndex={-1}>` so focus lands in the content.
 */
export function SkipLink({
  className,
  children = "Skip to content",
  href = `#${MAIN_CONTENT_ID}`,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "focus:bg-primary focus:text-primary-foreground focus:ring-ring/50 sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:ring-3 focus:outline-none",
        className
      )}
      data-slot="skip-link"
      href={href}
      {...props}
    >
      {children}
    </a>
  );
}
