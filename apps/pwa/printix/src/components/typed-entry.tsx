"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";

/** The API refuses longer values; a printed number is a few characters. */
export const TYPED_MAX_LENGTH = 32;

interface TypedEntryProps {
  readonly checking: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (value: string) => void;
}

/**
 * Typing a printed number, for a ticket whose barcode will not read. A bottom
 * sheet: focus starts in the field, Tab stays inside, Escape closes it and
 * focus goes back to the button that opened it.
 */
export function TypedEntry({ checking, onSubmit, onClose }: TypedEntryProps) {
  const sheet = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();

  useEffect(() => {
    const opener = document.activeElement;
    field.current?.focus();

    // Escape closes; Tab stays inside the sheet. Listening on the document keeps
    // the keys out of the sheet's own handlers, which a dialog does not need.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      const container = sheet.current;
      if (event.key !== "Tab" || !container) {
        return;
      }
      const items = Array.from(
        container.querySelectorAll<HTMLElement>("input, button:not(:disabled)")
      );
      const first = items.at(0);
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Type the printed number first.");
      field.current?.focus();
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-px-surface flex w-full flex-col gap-4 rounded-3xl p-5"
        ref={sheet}
        role="dialog"
      >
        <h2 className="text-xl font-semibold" id={titleId}>
          Type the printed number
        </h2>
        <form className="flex flex-col gap-3" noValidate onSubmit={submit}>
          <label className="text-px-muted text-sm" htmlFor={fieldId}>
            Printed number
          </label>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            className="bg-px-ink border-px-rule text-px-paper focus-visible:outline-px-green min-h-14 w-full rounded-2xl border px-4 font-mono text-xl tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
            id={fieldId}
            inputMode="numeric"
            maxLength={TYPED_MAX_LENGTH}
            name="printed-number"
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            placeholder="e.g. 042…"
            ref={field}
            spellCheck={false}
            type="text"
            value={value}
          />
          {error ? (
            <p
              className="bg-px-stop text-px-paper rounded-xl px-3 py-2 text-base font-semibold"
              id={errorId}
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            className="bg-px-green text-px-ink focus-visible:outline-px-paper min-h-14 w-full rounded-2xl text-lg font-semibold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            disabled={checking}
            type="submit"
          >
            {checking ? "Checking…" : "Check ticket"}
          </button>
          <button
            className="text-px-paper focus-visible:outline-px-paper min-h-11 w-full rounded-2xl text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </form>
      </section>
    </div>
  );
}
