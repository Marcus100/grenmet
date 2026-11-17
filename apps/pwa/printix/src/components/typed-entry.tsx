import { Sheet } from "@barrelsgd/pwa-kit/components/sheet";
import { type FormEvent, type RefObject, useId, useRef, useState } from "react";

/** The API refuses longer values; a printed number is a few characters. */
export const TYPED_MAX_LENGTH = 32;

interface TypedEntryProps {
  readonly checking: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (value: string) => void;
  readonly open: boolean;
}

/**
 * Typing a printed number, for a ticket whose barcode will not read. A shared
 * bottom sheet: it slides up, follows the finger, and a drag down, a tap
 * outside, Escape or Cancel closes it. Focus starts in the field, stays inside,
 * and goes back to the button that opened it. Each opening starts empty.
 */
export function TypedEntry({
  checking,
  onClose,
  onSubmit,
  open,
}: TypedEntryProps) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Sheet
      initialFocus={field}
      onClose={onClose}
      open={open}
      title="Type the printed number"
    >
      <TypedForm
        checking={checking}
        field={field}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Sheet>
  );
}

interface TypedFormProps {
  readonly checking: boolean;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly onClose: () => void;
  readonly onSubmit: (value: string) => void;
}

/** The sheet's form. The sheet creates it afresh on every opening. */
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
