"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";
import { changeEmailAction, sendEmailChangeCodeAction } from "@/app/actions";
import { initialEmailChangeState } from "@/app/actions-types";
import { SettingsRow } from "@/components/account-layout";
import { CodeField } from "@/components/code-field";
import {
  errorBoxClass,
  inputClass,
  labelClass,
  noticeBoxClass,
  primaryButtonClass,
} from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";
import { useHydrated } from "@/lib/use-hydrated";

// 44px tap target on phones; desktop keeps the compact button.
const outlineButton =
  "min-h-11 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted disabled:opacity-50 md:min-h-0";

const choiceLabel =
  "text-foreground flex min-h-11 items-center gap-3 text-sm md:min-h-0";

type Proof = "password" | "code";

interface EmailChangeSettingsProps {
  /** The address the person signs in with now. It is emailed a notice once it changes. */
  readonly currentEmail: string;
  /** False for an email-code account: it proves itself with a code only. */
  readonly hasPassword: boolean;
}

interface ProofChoiceProps {
  readonly currentEmail: string;
  readonly hasPassword: boolean;
  readonly onChoose: (proof: Proof) => void;
  readonly proof: Proof;
}

/** Which proof to use. An account with no password has only the emailed code. */
function ProofChoice({
  currentEmail,
  hasPassword,
  onChoose,
  proof,
}: ProofChoiceProps) {
  if (!hasPassword) {
    return (
      <p className="text-muted-foreground text-sm">
        This account has no password. We check it is you with a code we email to{" "}
        {currentEmail}.
      </p>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className={labelClass}>How should we check it is you?</legend>
      <label className={choiceLabel}>
        <input
          checked={proof === "password"}
          name="proof_method"
          onChange={() => onChoose("password")}
          type="radio"
          value="password"
        />
        Use my current password
      </label>
      <label className={choiceLabel}>
        <input
          checked={proof === "code"}
          name="proof_method"
          onChange={() => onChoose("code")}
          type="radio"
          value="code"
        />
        Email me a code
      </label>
    </fieldset>
  );
}

function requestCodeLabel(sending: boolean, sent: boolean): string {
  if (sending) return "Sending…";
  return sent ? "Send a new code" : "Email me a code";
}

interface CodeProofProps {
  readonly codeSent: boolean;
  readonly currentEmail: string;
  readonly hydrated: boolean;
  readonly onRequest: () => void;
  readonly sending: boolean;
}

/** The emailed-code proof: send the code, then type it in. Errors show above the form. */
function CodeProof({
  codeSent,
  currentEmail,
  hydrated,
  onRequest,
  sending,
}: CodeProofProps) {
  return (
    <div className="space-y-3">
      {codeSent ? (
        <p className={noticeBoxClass} role="status">
          We sent a 6-digit code to {currentEmail}. Enter it below.
        </p>
      ) : null}
      <button
        className={outlineButton}
        disabled={!hydrated || sending}
        onClick={onRequest}
        type="button"
      >
        {requestCodeLabel(sending, codeSent)}
      </button>
      {codeSent ? (
        <CodeField
          autoFocus
          id="email_code"
          label="6-digit code"
          name="email_code"
        />
      ) : null}
    </div>
  );
}

interface ProofFieldsProps {
  readonly codeSent: boolean;
  readonly currentEmail: string;
  readonly hasPassword: boolean;
  readonly hydrated: boolean;
  readonly onRequest: () => void;
  readonly proof: Proof;
  readonly sending: boolean;
}

/** The password or emailed-code field. Remounted after a refusal, so it clears. */
function ProofFields({
  codeSent,
  currentEmail,
  hasPassword,
  hydrated,
  onRequest,
  proof,
  sending,
}: ProofFieldsProps) {
  if (proof === "password" && hasPassword) {
    return (
      <PasswordField
        autoComplete="current-password"
        id="email_current_password"
        label="Current password"
        name="current_password"
      />
    );
  }
  if (proof === "code") {
    return (
      <CodeProof
        codeSent={codeSent}
        currentEmail={currentEmail}
        hydrated={hydrated}
        onRequest={onRequest}
        sending={sending}
      />
    );
  }
  return null;
}

/**
 * Change the sign-in email. The person proves it is them with the current password,
 * or with a code emailed to the current address. Submits through onSubmit and waits
 * for hydration. A refusal clears the password and code fields but keeps the new
 * address. On success the action signs every session out and redirects to sign-in
 * with a notice, so this component has no success state.
 */
export function EmailChangeSettings({
  currentEmail,
  hasPassword,
}: EmailChangeSettingsProps) {
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState<Proof>(hasPassword ? "password" : "code");
  const [changeState, changeAction, changing] = useActionState(
    changeEmailAction,
    initialEmailChangeState
  );
  const [codeState, sendCode, sendingCode] = useActionState(
    sendEmailChangeCodeAction,
    initialEmailChangeState
  );
  // A new refusal changes the key, which remounts the password and code fields empty.
  const [seenChange, setSeenChange] = useState(changeState);
  const [fieldsKey, setFieldsKey] = useState(0);
  if (changeState !== seenChange) {
    setSeenChange(changeState);
    if (changeState.error) setFieldsKey((key) => key + 1);
  }
  const hydrated = useHydrated();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      changeAction(data);
    });
  }

  function requestCode() {
    startTransition(() => {
      sendCode();
    });
  }

  // One error region: a refused change wins over a failed code send.
  const error = changeState.error ?? codeState.error;
  // A code can only be typed in after one was sent, so the submit waits for it.
  const canSubmit = proof === "password" || codeState.codeSent;

  return (
    <SettingsRow
      action={
        <button
          aria-expanded={open}
          className={outlineButton}
          onClick={() => setOpen((shown) => !shown)}
          type="button"
        >
          {open ? "Close" : "Change email"}
        </button>
      }
      description={`You sign in with ${currentEmail}.`}
      title="Address you sign in with"
    >
      {open ? (
        <form className="space-y-5" onSubmit={submit}>
          <p className="text-muted-foreground text-sm">
            We will email {currentEmail} to tell it the address has changed.
            Every device will be signed out, so sign in again with the new
            address.
          </p>

          {error ? (
            <div className={errorBoxClass} role="alert">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className={labelClass} htmlFor="new-email">
              New email address
            </label>
            <input
              autoComplete="email"
              autoFocus
              className={inputClass}
              id="new-email"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </div>

          <ProofChoice
            currentEmail={currentEmail}
            hasPassword={hasPassword}
            onChoose={setProof}
            proof={proof}
          />

          <ProofFields
            codeSent={codeState.codeSent}
            currentEmail={currentEmail}
            hasPassword={hasPassword}
            hydrated={hydrated}
            key={fieldsKey}
            onRequest={requestCode}
            proof={proof}
            sending={sendingCode}
          />

          {canSubmit ? (
            <button
              className={primaryButtonClass}
              disabled={!hydrated || changing}
              type="submit"
            >
              {changing ? "Changing…" : "Change email"}
            </button>
          ) : null}
        </form>
      ) : null}
    </SettingsRow>
  );
}
