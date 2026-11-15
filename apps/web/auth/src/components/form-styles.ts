// Shared by every auth form so fields, labels and buttons read as one system.
export const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-body text-foreground outline-none transition placeholder:text-muted-foreground focus:border-(--auth-accent) focus:ring-(--auth-accent-soft) focus:ring-4";

export const labelClass = "block font-medium text-body-sm text-foreground";

export const primaryButtonClass =
  "w-full rounded-lg bg-(--auth-accent) px-5 py-3 text-center font-medium text-sm text-white transition hover:bg-(--auth-accent-strong) disabled:opacity-60";

export const secondaryButtonClass =
  "block w-full rounded-lg border border-border px-5 py-3 text-center font-medium text-foreground text-sm transition hover:bg-muted";

// Deliberately no colour class: text links keep the surrounding text colour, as
// they always have. A colour class here would now apply and recolour them.
export const textLinkClass = "font-medium underline-offset-4 hover:underline";

export const errorBoxClass =
  "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm";

export const noticeBoxClass =
  "rounded-lg border border-border bg-muted px-4 py-3 text-foreground text-sm";
