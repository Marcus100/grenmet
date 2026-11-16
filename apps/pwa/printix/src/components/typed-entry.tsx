"use client";

import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { Drawer } from "vaul";

/** The API refuses longer values; a printed number is a few characters. */
export const TYPED_MAX_LENGTH = 32;

interface TypedEntryProps {
  readonly checking: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (value: string) => void;
  readonly open: boolean;
}

/**
 * Typing a printed number, for a ticket whose barcode will not read. A bottom
 * sheet that behaves like a phone's own: it slides up, follows the finger, and
 * a drag down, a tap outside, Escape or Cancel closes it. Focus starts in the
 * field, stays inside, and goes back to the button that opened it.
 */
export function TypedEntry({
  checking,
  onClose,
  onSubmit,
  open,
}: TypedEntryProps) {
  const field = useRef<HTMLInputElement>(null);
  const titleId = useId();
  // Each opening gets a fresh form, even one that starts while the sheet is
  // still sliding away: the last number and error never carry over.
  const [wasOpen, setWasOpen] = useState(open);
  const [opening, setOpening] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpening(opening + 1);
    }
  }

  return (
    <Drawer.Root
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Drawer.Content
          aria-describedby={undefined}
          aria-labelledby={titleId}
          className="bg-px-surface fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex flex-col gap-4 rounded-3xl px-5 pt-3 pb-5 outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            field.current?.focus();
          }}
        >
          <Drawer.Handle className="bg-px-rule! mx-auto h-1.5! w-12! rounded-full" />
          <Drawer.Title className="text-xl font-semibold" id={titleId}>
            Type the printed number
          </Drawer.Title>
          <TypedForm
            checking={checking}
            field={field}
            key={opening}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

interface TypedFormProps {
  readonly checking: boolean;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly onClose: () => void;
  readonly onSubmit: (value: string) => void;
}

/** The sheet's form. Its parent gives it a new key on every opening. */
function TypedForm({ checking, field, onClose, onSubmit }: TypedFormProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = useId();

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
        className="bg-px-green text-px-ink focus-visible:outline-px-paper min-h-14 w-full rounded-2xl text-lg font-semibold transition-transform duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
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
  );
}
