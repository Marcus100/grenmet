import {
  eregisterEmailRegisterObservation,
  eregisterListObservationSends,
  eregisterPublishRegisterObservation,
  type ObservationSend,
} from "@barrelsgd/api-client";
import { useCallback, useEffect, useState } from "react";

export type SendTarget = "email" | "wis2";

export interface SendController {
  cancel: () => void;
  confirm: () => void;
  confirming: SendTarget | null;
  error: string | null;
  history: ObservationSend[];
  pending: SendTarget | null;
  /** The target was already sent; confirming again resends. */
  repeat: boolean;
  request: (target: SendTarget) => void;
}

const POLL_MS = 10_000;
const RESEND_HINT = "resend=true";

export function utcClock(iso: string): string {
  const stamp = iso.endsWith("Z") ? iso : `${iso}Z`;
  return `${new Date(stamp).toISOString().slice(11, 16)}Z`;
}

function latest(sends: ObservationSend[], target: SendTarget) {
  return sends.find((send) => send.target === target);
}

/** "Emailed 12:03Z to 3 · Queued for WIS2 12:03Z"; empty when nothing was sent. */
export function describeSends(sends: ObservationSend[]): string {
  const parts: string[] = [];
  const email = latest(sends, "email");
  if (email) {
    const to = `to ${email.recipients ?? 0}`;
    if (email.status === "sent") {
      parts.push(`Emailed ${utcClock(email.sent_at ?? email.queued_at)} ${to}`);
    } else if (email.status === "queued") {
      parts.push(`Email queued ${utcClock(email.queued_at)} ${to}`);
    } else {
      parts.push(`Email failed ${utcClock(email.queued_at)}`);
    }
  }
  const wis2 = latest(sends, "wis2");
  if (wis2) {
    if (wis2.status === "sent") {
      parts.push(`Sent to WIS2 ${utcClock(wis2.sent_at ?? wis2.queued_at)}`);
    } else if (wis2.status === "queued") {
      parts.push(`Queued for WIS2 ${utcClock(wis2.queued_at)}`);
    } else {
      parts.push(`WIS2 failed ${utcClock(wis2.queued_at)}`);
    }
  }
  return parts.join(" · ");
}

export function failedReason(sends: ObservationSend[]): string | null {
  const failed = sends.find(
    (send) => send.status === "failed" && send.last_error
  );
  return failed?.last_error ?? null;
}

function errorDetail(error: unknown, status: number | undefined): string {
  if (error && typeof error === "object" && "detail" in error) {
    const { detail } = error as { detail: unknown };
    if (typeof detail === "string") return detail;
  }
  if (status === 403) return "You do not have permission to send observations.";
  return "The observation could not be sent. Try again.";
}

/**
 * Email and WIS2 actions for the observation being keyed. `ensureSaved`
 * validates and saves the workbook (when it changed) and resolves its id, or
 * null when it cannot be saved.
 */
export function useObservationSends(
  ensureSaved: () => Promise<string | null>
): SendController & { observationId: string | null } {
  const [observationId, setObservationId] = useState<string | null>(null);
  const [history, setHistory] = useState<ObservationSend[]>([]);
  const [confirming, setConfirming] = useState<SendTarget | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [pending, setPending] = useState<SendTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const result = await eregisterListObservationSends({
      path: { observation_id: id },
      throwOnError: false,
    });
    if (result.data) setHistory(result.data.sends);
  }, []);

  const hasQueued = history.some((send) => send.status === "queued");
  useEffect(() => {
    if (!(observationId && hasQueued)) return;
    const timer = setInterval(() => {
      refresh(observationId).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [observationId, hasQueued, refresh]);

  const request = (target: SendTarget) => {
    setError(null);
    setRepeat(false);
    setConfirming(target);
  };

  const cancel = () => {
    setConfirming(null);
    setRepeat(false);
  };

  const confirm = () => {
    if (!confirming || pending) return;
    const target = confirming;
    const run = async () => {
      setPending(target);
      setError(null);
      try {
        const id = await ensureSaved();
        if (!id) {
          setConfirming(null);
          setError("Fix the errors above, then save before sending.");
          return;
        }
        if (id !== observationId) setHistory([]);
        setObservationId(id);
        const send =
          target === "email"
            ? eregisterEmailRegisterObservation
            : eregisterPublishRegisterObservation;
        const result = await send({
          body: { resend: repeat },
          path: { observation_id: id },
          throwOnError: false,
        });
        if (result.error || !result.data) {
          const message = errorDetail(result.error, result.response?.status);
          if (message.includes(RESEND_HINT)) {
            setRepeat(true);
            return;
          }
          setConfirming(null);
          setError(message);
          return;
        }
        setConfirming(null);
        setRepeat(false);
        await refresh(id);
      } catch {
        setConfirming(null);
        setError("The observation could not be sent. Try again.");
      } finally {
        setPending(null);
      }
    };
    run().catch(() => undefined);
  };

  return {
    cancel,
    confirm,
    confirming,
    error,
    history,
    observationId,
    pending,
    repeat,
    request,
  };
}
