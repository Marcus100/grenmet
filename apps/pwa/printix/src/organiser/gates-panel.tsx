import type {
  PrintixEventAnalytics,
  PrintixGateAnalytics,
} from "@barrelsgd/api-client";
import {
  agoWords,
  count,
  type PhoneNote,
  percent,
  phoneNote,
  timeOf,
} from "@/organiser/analytics-format";
import { isEventClosed } from "@/organiser/event-state";

interface GatesPanelProps {
  readonly analytics: PrintixEventAnalytics;
}

/** Each gate: people let in, refused, the share typed by hand, and when it last scanned. */
export function GatesPanel({ analytics }: GatesPanelProps) {
  const { gates, generated_at: now } = analytics;
  const open = !isEventClosed(analytics.event, new Date(now));

  return (
    <section aria-labelledby="gates-title" className="flex flex-col gap-3">
      <h4 className="text-lg font-semibold" id="gates-title">
        Gates
      </h4>
      {gates.length === 0 ? (
        <p className="bg-px-surface text-px-muted rounded-2xl px-4 py-3 text-base">
          No gate codes have been made for this event yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {gates.map((gate) => (
            <GateCard gate={gate} key={gate.gate} now={now} open={open} />
          ))}
        </ul>
      )}
    </section>
  );
}

function typedWords(gate: PrintixGateAnalytics): string {
  if (gate.typed_share === null || gate.typed_share === undefined) {
    return "No scans yet";
  }
  return `${percent(gate.typed_share)} (${count(gate.typed_scans)} of ${count(gate.scans)})`;
}

function lastScanWords(gate: PrintixGateAnalytics, now: string): string {
  return gate.last_scan_at
    ? `${timeOf(gate.last_scan_at)} (${agoWords(gate.last_scan_at, now)})`
    : "None yet";
}

function GateCard({
  gate,
  now,
  open,
}: {
  readonly gate: PrintixGateAnalytics;
  readonly now: string;
  readonly open: boolean;
}) {
  const many = gate.phones.length > 1;
  const notes = gate.phones
    .map((phone, index) =>
      phoneNote(phone, { many, number: index + 1 }, now, open)
    )
    .filter((note): note is PhoneNote => note !== null);

  return (
    <li className="bg-px-surface border-px-rule flex flex-col gap-2 rounded-2xl border p-4">
      <p className="text-base font-semibold break-words">{gate.gate}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-px-muted">Let in</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {count(gate.admitted)}
          </dd>
        </div>
        <div>
          <dt className="text-px-muted">Refused</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {count(gate.refused)}
          </dd>
        </div>
        <div>
          <dt className="text-px-muted">Typed by hand</dt>
          <dd className="tabular-nums">{typedWords(gate)}</dd>
        </div>
        <div>
          <dt className="text-px-muted">Last scan</dt>
          <dd className="tabular-nums">{lastScanWords(gate, now)}</dd>
        </div>
      </dl>
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {notes.map((note) => (
            <li
              className={note.flagged ? "font-semibold" : "text-px-muted"}
              key={note.key}
            >
              {note.text}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
