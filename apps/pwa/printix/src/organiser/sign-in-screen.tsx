import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { type Problem, problemMessage } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";
import { requestEmailCode, verifySignIn } from "@/organiser/sign-in";
import {
  ALERT,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD,
  NOTE,
  PAGE,
} from "@/organiser/styles";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const SIX_DIGITS = /^\d{6}$/u;

/** Keeps digits only, so a pasted "123 456" still reads as six digits. */
function digitsOnly(value: string): string {
  return value.replace(/\D/gu, "").slice(0, 6);
}

/** Which field a sign-in failure belongs to, so focus can go back to it. */
function fieldFor(problem: Problem): "code" | "totp" | null {
  if (problem.kind === "email-code-wrong") {
    return "code";
  }
  if (problem.kind === "authenticator-wrong") {
    return "totp";
  }
  return null;
}

interface SignInScreenProps {
  /** A line explaining why the person is here, for example a session that ended. */
  readonly notice: string | null;
  readonly onSignedIn: () => void;
  readonly session: OrganiserSession;
}

/**
 * Sign-in for organisers: an email step, then one step with the emailed code
 * and the authenticator code together. Sessions last while this tab is open.
 */
export function SignInScreen({
  session,
  notice,
  onSignedIn,
}: SignInScreenProps) {
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <main className={PAGE}>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Printix organiser
        </h1>
        <p className="text-px-muted text-base">
          Sign in with your Barrels account.
        </p>
      </header>

      {notice ? (
        <p className={NOTE} role="status">
          {notice}
        </p>
      ) : null}

      {sentTo === null ? (
        <EmailStep onSent={setSentTo} session={session} />
      ) : (
        <CodeStep
          email={sentTo}
          onBack={() => setSentTo(null)}
          onSignedIn={onSignedIn}
          session={session}
        />
      )}

      <p className="text-px-muted text-sm">
        First time? Accept your invitation and add an authenticator at
        account.barrels.gd, then sign in here.
      </p>
    </main>
  );
}

function EmailStep({
  session,
  onSent,
}: {
  readonly session: OrganiserSession;
  readonly onSent: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const errorId = useId();

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_SHAPE.test(address)) {
      setError(
        "Enter the email address you use for Barrels, such as name@example.com."
      );
      field.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await requestEmailCode(session, address);
    setBusy(false);
    if (outcome.ok) {
      onSent(address);
    } else {
      setError(problemMessage(outcome.problem));
    }
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold" htmlFor={fieldId}>
          Email address
        </label>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error !== null}
          autoCapitalize="none"
          autoComplete="email"
          className={FIELD}
          id={fieldId}
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          ref={field}
          spellCheck={false}
          type="email"
          value={email}
        />
        <p className="text-px-muted text-sm">
          We will email you a 6-digit code.
        </p>
      </div>

      {error ? (
        <p className={ALERT} id={errorId} role="alert">
          {error}
        </p>
      ) : null}

      <button
        aria-busy={busy}
        className={BUTTON_PRIMARY}
        disabled={busy}
        type="submit"
      >
        {busy ? "Sending…" : "Send the code"}
      </button>
    </form>
  );
}

function CodeStep({
  session,
  email,
  onBack,
  onSignedIn,
}: {
  readonly session: OrganiserSession;
  readonly email: string;
  readonly onBack: () => void;
  readonly onSignedIn: () => void;
}) {
  const [code, setCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<{
    readonly message: string;
    readonly field: "code" | "totp" | null;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeField = useRef<HTMLInputElement>(null);
  const totpField = useRef<HTMLInputElement>(null);
  const codeId = useId();
  const totpId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    codeField.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!SIX_DIGITS.test(code)) {
      setError({
        message: "Enter the 6-digit code from the email.",
        field: "code",
      });
      codeField.current?.focus();
      return;
    }
    if (!SIX_DIGITS.test(totpCode)) {
      setError({
        message: "Enter the 6-digit code from your authenticator app.",
        field: "totp",
      });
      totpField.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    const outcome = await verifySignIn(session, { email, code, totpCode });
    setBusy(false);
    if (outcome.ok) {
      onSignedIn();
      return;
    }
    const field = fieldFor(outcome.problem);
    setError({ message: problemMessage(outcome.problem), field });
    if (field === "code") {
      setCode("");
      codeField.current?.focus();
    } else if (field === "totp") {
      setTotpCode("");
      totpField.current?.focus();
    }
  }

  async function sendNewCode() {
    setBusy(true);
    setError(null);
    const outcome = await requestEmailCode(session, email);
    setBusy(false);
    if (outcome.ok) {
      setCode("");
      setNote(`A new code was sent to ${email}.`);
      codeField.current?.focus();
    } else {
      setError({ message: problemMessage(outcome.problem), field: null });
    }
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
      <p className="text-base">
        Sign in as <span className="font-semibold break-all">{email}</span>.
      </p>
      <p className="text-px-muted text-sm" id={hintId}>
        Enter the 6-digit code from the email, then the 6-digit code from your
        authenticator app.
      </p>

      {note ? (
        <p className={NOTE} role="status">
          {note}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold" htmlFor={codeId}>
          Code from the email
        </label>
        <input
          aria-describedby={error?.field === "code" ? errorId : hintId}
          aria-invalid={error?.field === "code"}
          autoComplete="one-time-code"
          className={FIELD}
          id={codeId}
          inputMode="numeric"
          onChange={(event) => setCode(digitsOnly(event.target.value))}
          ref={codeField}
          type="text"
          value={code}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold" htmlFor={totpId}>
          Code from your authenticator app
        </label>
        <input
          aria-describedby={error?.field === "totp" ? errorId : hintId}
          aria-invalid={error?.field === "totp"}
          autoComplete="one-time-code"
          className={FIELD}
          id={totpId}
          inputMode="numeric"
          onChange={(event) => setTotpCode(digitsOnly(event.target.value))}
          ref={totpField}
          type="text"
          value={totpCode}
        />
      </div>

      {error ? (
        <p className={ALERT} id={errorId} role="alert">
          {error.message}
        </p>
      ) : null}

      <button
        aria-busy={busy}
        className={BUTTON_PRIMARY}
        disabled={busy}
        type="submit"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <button
        className={BUTTON_SECONDARY}
        disabled={busy}
        onClick={sendNewCode}
        type="button"
      >
        Send a new code
      </button>
      <button
        className="text-px-muted focus-visible:outline-px-paper min-h-11 self-start text-base underline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={onBack}
        type="button"
      >
        Use a different email
      </button>
    </form>
  );
}
