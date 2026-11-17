// Shared classes for the organiser screens. Printix colours only (px-*), dark
// look (docs/design/printix.md). Controls are at least 44 px tall and inputs
// 16 px, so a phone does not zoom in on them.

export const PAGE =
  "pwa-screen mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]";

const FOCUS =
  "focus-visible:outline-px-paper focus-visible:outline-2 focus-visible:outline-offset-2";

export const BUTTON_PRIMARY = `bg-px-green text-px-ink ${FOCUS} hover:opacity-90 disabled:opacity-50 min-h-11 rounded-2xl px-5 text-base font-semibold transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100`;

export const BUTTON_SECONDARY = `border-px-rule bg-px-surface text-px-paper ${FOCUS} hover:bg-px-rule disabled:opacity-50 min-h-11 rounded-2xl border px-4 text-base font-semibold`;

export const BUTTON_ROW = `border-px-rule bg-px-surface text-px-paper ${FOCUS} hover:bg-px-rule flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-base`;

export const FIELD = `bg-px-surface text-px-paper border-px-rule placeholder:text-px-muted ${FOCUS} aria-[invalid=true]:border-px-stop min-h-11 w-full rounded-xl border px-3 text-base tabular-nums`;

export const ALERT =
  "bg-px-stop text-px-paper rounded-2xl px-4 py-3 text-base font-semibold";

export const NOTE =
  "bg-px-surface text-px-paper rounded-2xl px-4 py-3 text-base";
