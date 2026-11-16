import type { PrintixOrganiserOrganisation } from "@barrelsgd/api-client";
import { useState } from "react";
import { type Problem, problemMessage } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";
import { ALERT, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/organiser/styles";
import { closeEvent } from "@/organiser/write-api";

interface CloseEventSectionProps {
  readonly eventId: string;
  readonly onClosed: () => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

/** Closes the event for good, after a confirm step. Organisers only. */
export function CloseEventSection({
  session,
  organisation,
  eventId,
  onClosed,
}: CloseEventSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function close() {
    setBusy(true);
    setProblem(null);
    const outcome = await closeEvent(session, organisation.id, eventId);
    setBusy(false);
    if (outcome.ok) {
      setConfirming(false);
      onClosed();
    } else {
      setProblem(outcome.problem);
    }
  }

  return (
    <section
      aria-labelledby="close-title"
      className="border-px-rule flex flex-col gap-4 border-t pt-6"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold" id="close-title">
          Close event
        </h3>
        <p className="text-px-muted text-sm">
          Closing stops every gate code from admitting people, and stops tickets
          from changing.
        </p>
      </div>

      {problem ? (
        <p className={ALERT} role="alert">
          {problemMessage(problem)}
        </p>
      ) : null}

      {confirming ? (
        <section
          aria-label="Confirm closing the event"
          className="flex flex-col gap-3"
        >
          <p className="text-base font-semibold">
            Close this event? This cannot be undone. Gate codes stop admitting
            people straight away.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className={BUTTON_PRIMARY}
              disabled={busy}
              onClick={close}
              type="button"
            >
              {busy ? "Closing…" : "Yes, close the event"}
            </button>
            <button
              className={BUTTON_SECONDARY}
              onClick={() => setConfirming(false)}
              type="button"
            >
              Keep it open
            </button>
          </div>
        </section>
      ) : (
        <button
          className={BUTTON_SECONDARY}
          onClick={() => setConfirming(true)}
          type="button"
        >
          Close event
        </button>
      )}
    </section>
  );
}
