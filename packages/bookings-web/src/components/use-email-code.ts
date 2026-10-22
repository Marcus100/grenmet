"use client";

import { useEffect, useState } from "react";
import type { BookingFlowActions } from "../lib/booking-types";

export const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;
const SIX_DIGITS = /^\d{6}$/;
const NON_DIGITS = /\D/g;

const CODE_NETWORK_MESSAGE =
  "We couldn't reach the booking service, so nothing was sent. Please try again in a moment.";

export const TOKEN_LOADING_MESSAGE =
  "Verification is still loading. Please wait a moment and try again.";

/** What a proof is bound to: change any part and the visitor verifies again. */
export function bindingKey(
  serviceId: string | null,
  startsAt: string | null,
  email: string
): string | null {
  return serviceId && startsAt
    ? `${serviceId}|${startsAt}|${email.trim()}`
    : null;
}

interface Verified {
  key: string;
  /** null: the API said no code is needed for this booking. */
  proof: string | null;
}

interface UseEmailCodeArgs {
  actions: Pick<BookingFlowActions, "confirmEmailCode" | "requestEmailCode">;
  email: string;
  /** Shows a message in the form-level error summary. */
  onFormError: (message: string) => void;
  /** A Turnstile token was spent: the host solves a fresh one. */
  onTokenSpent: () => void;
  serviceId: string | null;
  startsAt: string | null;
  token: string | null;
  tokenMissing: boolean;
}

/**
 * The emailed-code step before a deposit booking. The proof lives in this
 * hook's state only (never storage or the URL) and only for the exact
 * service, slot and email it was issued for: changing any of them makes it
 * stale at once, because validity is derived from the binding key.
 */
export function useEmailCode({
  actions,
  email,
  onFormError,
  onTokenSpent,
  serviceId,
  startsAt,
  token,
  tokenMissing,
}: UseEmailCodeArgs) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState<Verified | null>(null);

  const cooling = cooldown > 0;
  useEffect(() => {
    if (!cooling) {
      return;
    }
    const timer = setInterval(
      () => setCooldown((n) => Math.max(0, n - 1)),
      1000
    );
    return () => clearInterval(timer);
  }, [cooling]);

  const key = bindingKey(serviceId, startsAt, email);
  const isVerified = key !== null && verified?.key === key;
  const stepOpen = key !== null && openFor === key && !isVerified;

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  /** Asks the API to email a code; null when it failed (and `show` was told). */
  const send = async (
    forKey: string,
    show: (message: string) => void
  ): Promise<{ required: boolean } | null> => {
    if (!(serviceId && startsAt)) {
      return null;
    }
    setBusy("send");
    try {
      const outcome = await actions.requestEmailCode({
        serviceId,
        startsAt,
        email: email.trim(),
        turnstileToken: token ?? "",
      });
      if (!outcome.ok) {
        show(outcome.message);
        return null;
      }
      if (outcome.data.required) {
        setOpenFor(forKey);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setVerified({ key: forKey, proof: null });
      }
      return outcome.data;
    } catch {
      show(CODE_NETWORK_MESSAGE);
      return null;
    } finally {
      setBusy(null);
      onTokenSpent();
    }
  };

  const start = async () => {
    if (!key) {
      return;
    }
    if (tokenMissing) {
      onFormError(TOKEN_LOADING_MESSAGE);
      return;
    }
    setCode("");
    clearMessages();
    await send(key, onFormError);
  };

  const resend = async () => {
    if (!key || busy) {
      return;
    }
    clearMessages();
    const sent = await send(key, setError);
    if (sent?.required) {
      setCode("");
      setNotice("We sent you a new code. The earlier one no longer works.");
    }
  };

  const verify = async () => {
    if (!(serviceId && startsAt && key)) {
      return;
    }
    if (!SIX_DIGITS.test(code)) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }
    setBusy("verify");
    clearMessages();
    try {
      const outcome = await actions.confirmEmailCode({
        code,
        email: email.trim(),
        serviceId,
        startsAt,
      });
      if (outcome.ok) {
        setVerified({ key, proof: outcome.data.proof });
        setOpenFor(null);
        setCode("");
        return;
      }
      setError(outcome.message);
      if (outcome.code === "code_rejected") {
        setCode("");
      }
    } catch {
      setError(CODE_NETWORK_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  /** Back to the email field; the code box closes. */
  const closeStep = () => {
    setOpenFor(null);
    setCode("");
    clearMessages();
  };

  /** The booking call refused the proof (used, expired): ask for a new code. */
  const dropProof = () => {
    setVerified(null);
    setOpenFor(null);
  };

  return {
    busy,
    closeStep,
    cooldown,
    code,
    dropProof,
    error,
    isVerified,
    notice,
    proof: isVerified ? (verified?.proof ?? null) : null,
    resend,
    setCode: (value: string) =>
      setCode(value.replace(NON_DIGITS, "").slice(0, CODE_LENGTH)),
    start,
    stepOpen,
    verify,
  };
}
