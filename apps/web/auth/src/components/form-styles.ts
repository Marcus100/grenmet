// Shared by every auth form so fields, labels and buttons read as one system.
// Barrels platform look: navy `primary` for the one main action, `ring` for focus.

// 16px on phones: iOS Safari zooms the page on focus for smaller text.
export const inputClass =
  "w-full rounded-lg border border-input bg-background px-4 py-3 text-body-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/25 md:text-body";

export const labelClass = "block font-medium text-body-sm text-foreground";

export const primaryButtonClass =
  "w-full rounded-lg bg-primary px-5 py-3 text-center font-medium text-primary-foreground text-sm transition hover:bg-primary/90 disabled:opacity-60";

export const secondaryButtonClass =
  "block w-full rounded-lg border border-border px-5 py-3 text-center font-medium text-foreground text-sm transition hover:bg-muted";

// Deliberately no colour class: text links keep the surrounding text colour, as
// they always have. A colour class here would now apply and recolour them.
// The min height keeps the tap target at 44px on phones; desktop keeps the line.
export const textLinkClass =
  "inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline md:min-h-0";

export const errorBoxClass =
  "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm";

export const noticeBoxClass =
  "rounded-lg border border-border bg-muted px-4 py-3 text-foreground text-sm";
