import { cn } from "@barrelsgd/ui/lib/utils";

// The studio page pattern (docs/design/bookings.md, Studio): the admin kit's
// `PageHeader` (h1, one line of description, the page's primary action), then
// cards on the white content surface. These are the studio's own action and
// card classes; the shell and headers come from `@barrelsgd/admin-kit`.

/** Keyboard focus that shows on white and on the grey ground. */
export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-[120ms]";

/** The page's one primary action: navy, full width on a phone. */
export const PRIMARY_ACTION = cn(
  BUTTON,
  FOCUS,
  "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 w-full sm:w-auto"
);

/** A quieter action beside or below the primary one. */
export const SECONDARY_ACTION = cn(
  BUTTON,
  FOCUS,
  "border-border bg-background text-foreground hover:bg-muted active:bg-muted border"
);

/** A text link inside a card. */
export const CARD_LINK = cn(
  FOCUS,
  "text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
);

/**
 * A content card. The admin shell's surface is white, so a card is told apart
 * by the same hairline ring the kit's cards use (`PageSection`).
 */
export const CARD =
  "bg-card text-card-foreground ring-foreground/10 rounded-xl p-4 ring-1 sm:p-6";
