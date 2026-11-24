import { cn } from "@barrelsgd/ui/lib/utils";

// The studio page pattern (docs/design/bookings.md, Studio): a header with the
// h1, one line of description and the page's primary action, then white cards
// on the grey ground. Muted text only ever sits on white, never on the ground.

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

/** The white card: radius 20 on the grey ground. */
export const CARD = "bg-background rounded-[20px] p-4 sm:p-6";

export function StudioPageHeader({
  action,
  description,
  title,
}: Readonly<{
  action?: React.ReactNode;
  description?: React.ReactNode;
  title: string;
}>) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-foreground text-2xl font-bold">{title}</h1>
        {description ? (
          <p className="text-foreground/80">{description}</p>
        ) : null}
      </div>
      {action ? <div className="sm:shrink-0">{action}</div> : null}
    </header>
  );
}

export function StudioCard({
  as: Tag = "section",
  children,
  className,
  ...rest
}: Readonly<
  {
    as?: "article" | "div" | "section";
    children: React.ReactNode;
    className?: string;
  } & React.HTMLAttributes<HTMLElement>
>) {
  return (
    <Tag className={cn(CARD, className)} {...rest}>
      {children}
    </Tag>
  );
}
