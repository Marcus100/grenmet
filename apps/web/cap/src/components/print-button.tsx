"use client";

export function PrintButton() {
  return (
    <button
      className="border-gm-border-input text-body-sm text-gm-blue-ink rounded-md border px-3 py-1.5 font-medium print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print this alert
    </button>
  );
}
