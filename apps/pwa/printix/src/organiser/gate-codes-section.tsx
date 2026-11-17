import type {
  PrintixOrganiserOrganisation,
  PrintixPairingCreated,
  PrintixPairingPublic,
} from "@barrelsgd/api-client";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type Problem, problemMessage } from "@/organiser/errors";
import { formatMoment, grenadaLocalToIso } from "@/organiser/format";
import { GateCodePanel } from "@/organiser/gate-code-panel";
import type { OrganiserSession } from "@/organiser/session";
import {
  ALERT,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD,
  NOTE,
} from "@/organiser/styles";
import { useConfirmFocus } from "@/organiser/use-confirm-focus";
import {
  cancelGateCode,
  createGateCode,
  listGateCodes,
} from "@/organiser/write-api";

/** Whether a gate code still admits people: not cancelled, not past its expiry. */
export function codeState(
  code: PrintixPairingPublic,
  now: Date
): "active" | "cancelled" | "expired" {
  if (code.revoked_at !== null) {
    return "cancelled";
  }
  return new Date(code.expires_at).getTime() <= now.getTime()
    ? "expired"
    : "active";
}

/** The words for a code's state. A closed event ends every code that was not cancelled. */
export function codeLabel(
  code: PrintixPairingPublic,
  now: Date,
  closed: boolean
): string {
  const state = codeState(code, now);
  if (state === "cancelled") {
    return "Cancelled";
  }
  if (closed) {
    return "Ended (event closed)";
  }
  return state === "active" ? "Active" : "Expired";
}

/** The sentence after an uncertain failure: the server may have made the code. */
export const MAYBE_MADE_SENTENCE =
  "A code may have been made. Check the list and cancel any you did not expect.";

type ListState =
  | { readonly kind: "loading" }
  | { readonly kind: "list"; readonly codes: PrintixPairingPublic[] }
  | { readonly kind: "problem"; readonly problem: Problem };

interface GateCodesSectionProps {
  readonly closed: boolean;
  readonly eventId: string;
  readonly onAnnounce: (text: string) => void;
  /** Called after a change, so the event's counts are read again. */
  readonly onChanged: () => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

/**
 * Gate codes for this event. Both roles can list them, make one and cancel one.
 * Only an organiser can allow typed printed numbers on a code; a gate lead never
 * sees that switch, and the server refuses it for them anyway.
 */
export function GateCodesSection({
  session,
  organisation,
  eventId,
  closed,
  onChanged,
  onAnnounce,
}: GateCodesSectionProps) {
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [formOpen, setFormOpen] = useState(false);
  const [panel, setPanel] = useState<{
    readonly gate: string;
    readonly expiresLabel: string;
    readonly secret: string;
  } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const load = useCallback(() => {
    latest.current += 1;
    const request = latest.current;
    listGateCodes(session, organisation.id, eventId).then((outcome) => {
      if (request !== latest.current) {
        return;
      }
      setList(
        outcome.ok
          ? { kind: "list", codes: outcome.value }
          : { kind: "problem", problem: outcome.problem }
      );
    });
  }, [session, organisation.id, eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Stable, so the panel's countdown is not restarted by parent re-renders.
  const hidePanel = useCallback(() => setPanel(null), []);

  function showCode(created: PrintixPairingCreated) {
    setPanel({
      gate: created.gate,
      expiresLabel: formatMoment(created.expires_at),
      secret: created.secret,
    });
    setFormOpen(false);
    load();
    onChanged();
    onAnnounce(`Gate code made for ${created.gate}. It is shown once.`);
  }

  async function cancel(code: PrintixPairingPublic) {
    setBusy(true);
    setProblem(null);
    const outcome = await cancelGateCode(session, organisation.id, code.id);
    setBusy(false);
    setCancelling(null);
    if (outcome.ok) {
      load();
      onChanged();
      onAnnounce(`Cancelled the code for ${code.gate}.`);
    } else {
      setProblem(outcome.problem);
    }
  }

  const codes = list.kind === "list" ? list.codes : [];
  const now = new Date();

  return (
    <section aria-labelledby="gate-codes-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-semibold" id="gate-codes-title">
            Gate codes
          </h3>
          <p className="text-px-muted text-sm">
            A gate code is the QR code a gate phone scans. It is shown once.
          </p>
        </div>
        {!(closed || formOpen) && panel === null ? (
          <button
            className={BUTTON_PRIMARY}
            onClick={() => setFormOpen(true)}
            type="button"
          >
            New gate code
          </button>
        ) : null}
      </div>

      {closed ? (
        <p className={NOTE} role="status">
          This event is closed. Its gate codes no longer admit people, and no
          new ones can be made.
        </p>
      ) : null}

      {problem ? (
        <p className={ALERT} role="alert">
          {problemMessage(problem)}
        </p>
      ) : null}

      {panel ? (
        <GateCodePanel
          expiresLabel={panel.expiresLabel}
          gate={panel.gate}
          onDone={hidePanel}
          onHide={hidePanel}
          secret={panel.secret}
        />
      ) : null}

      {formOpen && !closed ? (
        <GateCodeForm
          canAllowTyped={organisation.can_manage_events}
          eventId={eventId}
          onCancel={() => {
            setFormOpen(false);
            setProblem(null);
          }}
          onCreated={showCode}
          organisationId={organisation.id}
          session={session}
        />
      ) : null}

      {list.kind === "loading" ? (
        <p className="text-px-muted text-base" role="status">
          Loading gate codes…
        </p>
      ) : null}

      {list.kind === "list" && codes.length === 0 ? (
        <p className={NOTE}>No gate codes yet.</p>
      ) : null}

      {list.kind === "problem" ? (
        <button className={BUTTON_SECONDARY} onClick={load} type="button">
          Try again
        </button>
      ) : null}

      {codes.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {codes.map((code) => (
            <GateCodeRow
              busy={busy}
              closed={closed}
              code={code}
              confirming={cancelling === code.id}
              key={code.id}
              now={now}
              onAsk={() => setCancelling(code.id)}
              onConfirm={() => cancel(code)}
              onKeep={() => setCancelling(null)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface GateCodeRowProps {
  readonly busy: boolean;
  readonly closed: boolean;
  readonly code: PrintixPairingPublic;
  readonly confirming: boolean;
  readonly now: Date;
  readonly onAsk: () => void;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
}

/** One gate code: its gate, expiry and typed-numbers setting, with cancel and its confirm. */
function GateCodeRow({
  code,
  now,
  closed,
  busy,
  confirming,
  onAsk,
  onKeep,
  onConfirm,
}: GateCodeRowProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const label = codeLabel(code, now, closed);
  const canCancel = codeState(code, now) === "active" && !closed;
  useConfirmFocus(confirming && canCancel, keepButton, cancelButton);
  return (
    <li className="bg-px-surface border-px-rule flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold break-words">{code.gate}</p>
          <p className="text-px-muted text-sm">
            {codeState(code, now) === "active" && !closed
              ? "Works until"
              : "Was valid until"}{" "}
            {formatMoment(code.expires_at)}
          </p>
          <p className="text-px-muted text-sm">
            Typed numbers {code.allow_typed_numbers ? "on" : "off"}
          </p>
        </div>
        <p
          className={`text-sm font-semibold ${label === "Active" ? "text-px-green" : "text-px-muted"}`}
        >
          {label}
        </p>
      </div>

      {canCancel && !confirming ? (
        <button
          className={BUTTON_SECONDARY}
          onClick={onAsk}
          ref={cancelButton}
          type="button"
        >
          Cancel code
        </button>
      ) : null}

      {confirming && canCancel ? (
        <section
          aria-label={`Cancel the code for ${code.gate}`}
          className="flex flex-col gap-3"
        >
          <p className="text-base">
            Cancel the code for {code.gate}? The gate phone stops admitting
            people with it at once.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className={BUTTON_PRIMARY}
              disabled={busy}
              onClick={onConfirm}
              type="button"
            >
              Yes, cancel it
            </button>
            <button
              className={BUTTON_SECONDARY}
              onClick={onKeep}
              ref={keepButton}
              type="button"
            >
              Keep it
            </button>
          </div>
        </section>
      ) : null}
    </li>
  );
}

function GateCodeForm({
  session,
  organisationId,
  eventId,
  canAllowTyped,
  onCreated,
  onCancel,
}: {
  readonly session: OrganiserSession;
  readonly organisationId: string;
  readonly eventId: string;
  readonly canAllowTyped: boolean;
  readonly onCreated: (created: PrintixPairingCreated) => void;
  readonly onCancel: () => void;
}) {
  const [gate, setGate] = useState("");
  const [expires, setExpires] = useState("");
  const [allowTyped, setAllowTyped] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gateId = useId();
  const expiresId = useId();
  const typedId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.trim() === "") {
      setLocal("Give the gate a name, such as North gate.");
      return;
    }
    setLocal(null);
    setProblem(null);
    setBusy(true);
    const outcome = await createGateCode(session, organisationId, eventId, {
      gate: gate.trim(),
      expiresAt: expires === "" ? undefined : grenadaLocalToIso(expires),
      allowTypedNumbers: canAllowTyped && allowTyped,
    });
    setBusy(false);
    if (outcome.ok) {
      onCreated(outcome.value);
    } else {
      setProblem(outcome.problem);
    }
  }

  const message = local ?? (problem ? problemMessage(problem) : null);
  // No answer at all: the server may have made the code, so say so.
  const uncertain = problem?.kind === "no-signal";

  return (
    <form
      aria-label="New gate code"
      className="bg-px-surface border-px-rule flex flex-col gap-5 rounded-2xl border p-4"
      noValidate
      onSubmit={submit}
    >
      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold" htmlFor={gateId}>
          Gate name
        </label>
        <input
          className={FIELD}
          id={gateId}
          onChange={(event) => setGate(event.target.value)}
          type="text"
          value={gate}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold" htmlFor={expiresId}>
          Works until (Grenada time, optional)
        </label>
        <input
          aria-describedby={`${expiresId}-hint`}
          className={FIELD}
          id={expiresId}
          onChange={(event) => setExpires(event.target.value)}
          type="datetime-local"
          value={expires}
        />
        <p className="text-px-muted text-sm" id={`${expiresId}-hint`}>
          Leave blank for six hours after the event closes. At most a day after
          it closes.
        </p>
      </div>

      {canAllowTyped ? (
        <div className="flex items-start gap-3">
          <input
            aria-checked={allowTyped}
            aria-describedby={`${typedId}-hint`}
            checked={allowTyped}
            className="accent-px-green mt-1 h-6 w-6 shrink-0"
            id={typedId}
            onChange={(event) => setAllowTyped(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          <div className="flex flex-col gap-1">
            <label className="text-base font-semibold" htmlFor={typedId}>
              Allow typed numbers
            </label>
            <p className="text-px-muted text-sm" id={`${typedId}-hint`}>
              Off by default: only a barcode admits. On, a printed number typed
              at this gate admits too.
            </p>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="flex flex-col gap-2">
          <p className={ALERT} role="alert">
            {message}
          </p>
          {uncertain ? <p className={NOTE}>{MAYBE_MADE_SENTENCE}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          aria-busy={busy}
          className={BUTTON_PRIMARY}
          disabled={busy}
          type="submit"
        >
          {busy ? "Making…" : "Make gate code"}
        </button>
        <button className={BUTTON_SECONDARY} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
