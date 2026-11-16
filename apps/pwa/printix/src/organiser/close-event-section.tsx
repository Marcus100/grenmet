import type { PrintixOrganiserOrganisation } from "@barrelsgd/api-client";
import { useRef, useState } from "react";
import { type Problem, problemMessage } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";
import { ALERT, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/organiser/styles";
import { useConfirmFocus } from "@/organiser/use-confirm-focus";
import { closeEvent } from "@/organiser/write-api";

interface CloseEventSectionProps {
  readonly eventId: string;
  readonly onAnnounce: (text: string) => void;
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
  onAnnounce,
}: CloseEventSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  useConfirmFocus(confirming, keepButton, openButton);

  async function close() {
    setBusy(true);
    setProblem(null);
    const outcome = await closeEvent(session, organisation.id, eventId);
    setBusy(false);
    if (outcome.ok) {
      setConfirming(false);
      onClosed();
      onAnnounce("The event is closed. Gate codes no longer admit people.");
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
              ref={keepButton}
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
          ref={openButton}
          type="button"
        >
          Close event
        </button>
      )}
    </section>
  );
}
