"use client";

export function PrintButton() {
  return (
    <button
      className="rounded-md border border-gm-border-input px-3 py-1.5 font-medium text-body-sm text-gm-blue-ink print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print this alert
    </button>
  );
}
