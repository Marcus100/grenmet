import type {
  CapAlertPublic,
  CapAuditEventPublic,
} from "@barrelsgd/api-client";
import { readSourceBulletinLink } from "@/lib/desk/cap/cap-bulletin-link";

const GRENADA = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Grenada",
});

/** A UTC instant in Grenada time, or a plain "Not set". */
export function grenadaTime(iso: string | null | undefined): string {
  if (!iso) return "Not set";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${GRENADA.format(date)} AST`;
}

/** The account is staff but may not use the warning desk. */
export function DeskRefused({ email }: { email: string }) {
  return (
    <section className="space-y-3 py-10" role="alert">
      <h1 className="font-semibold text-2xl">No access to CAP warnings</h1>
      <p className="text-muted-foreground">
        {email} is signed in but does not hold CAP warning access. Ask a GMS
        administrator to give you a CAP role.
      </p>
    </section>
  );
}

export function DeskUnavailable({ what }: { what: string }) {
  return (
    <section className="space-y-3 py-10" role="alert">
      <h1 className="font-semibold text-2xl">{what} could not be loaded</h1>
      <p className="text-muted-foreground">
        The warning service did not answer. Reload the page. If a warning must
        go out now, use the CAP desk in GAA Admin.
      </p>
    </section>
  );
}

/** Lifecycle, CAP status and import flags in words; colour is only extra. */
export function AlertBadges({ alert }: { alert: CapAlertPublic }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5 text-caption">
      <span className="rounded-full border px-2 py-0.5 font-medium">
        {alert.lifecycle_state}
      </span>
      <span className="rounded-full border px-2 py-0.5">{alert.msg_type}</span>
      {alert.status === "Actual" ? null : (
        <span className="rounded-full border border-destructive px-2 py-0.5 font-semibold text-destructive">
          {alert.status}: not a live warning
        </span>
      )}
      {alert.import_source ? (
        <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning-soft-foreground">
          Imported ({alert.import_source})
        </span>
      ) : null}
      {alert.schema_conformant ? null : (
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
          Does not follow CAP 1.2
        </span>
      )}
    </span>
  );
}

/** Format problems recorded on the emergency and cancellation paths. */
export function formatProblems(
  events: readonly CapAuditEventPublic[]
): { action: string; at: string; problem: string }[] {
  return events.flatMap((event) => {
    const problem = event.payload?.schema_mismatch;
    return typeof problem === "string" && problem
      ? [{ action: event.action, at: event.created_at, problem }]
      : [];
  });
}

export function FormatProblemBanner({
  problems,
}: {
  problems: ReturnType<typeof formatProblems>;
}) {
  if (problems.length === 0) return null;
  return (
    <div
      className="space-y-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
      role="alert"
    >
      <p className="font-semibold text-destructive">
        This alert went out with a CAP format problem
      </p>
      <ul className="list-disc space-y-1 pl-5 text-body-sm">
        {problems.map((item) => (
          <li key={`${item.at}-${item.action}`}>
            {item.action === "cancel" ? "Cancellation" : "Emergency publish"} at{" "}
            {grenadaTime(item.at)}: {item.problem}
          </li>
        ))}
      </ul>
      <p className="text-body-sm">
        The warning was not held back. The duty supervisor was notified.
      </p>
    </div>
  );
}

export function SavedAlert({ alert }: { alert: CapAlertPublic }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted-foreground">Identifier</dt>
          <dd className="break-all font-mono">{alert.identifier}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Sender · sent</dt>
          <dd>
            {alert.sender} · {grenadaTime(alert.sent)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            Status · type · scope
          </dt>
          <dd>
            {alert.status} · {alert.msg_type} · {alert.scope}
          </dd>
        </div>
        {(alert.references ?? []).length > 0 ? (
          <div>
            <dt className="font-medium text-muted-foreground">Replaces</dt>
            <dd className="break-all font-mono">
              {(alert.references ?? []).map((ref) => ref.identifier).join(", ")}
            </dd>
          </div>
        ) : null}
        {alert.note ? (
          <div className="sm:col-span-2">
            <dt className="font-medium text-muted-foreground">Staff note</dt>
            <dd className="whitespace-pre-wrap">{alert.note}</dd>
          </div>
        ) : null}
      </dl>
      {(alert.info ?? []).map((info) => {
        const source = readSourceBulletinLink(info.parameters);
        return (
          <section
            className="space-y-2 rounded-lg border bg-card p-4 text-body-sm"
            key={info.id}
          >
            <h2 className="font-semibold text-lg">
              {info.headline} ({info.language})
            </h2>
            <p>
              {info.event} · Severity {info.severity} · Urgency {info.urgency} ·
              Certainty {info.certainty}
            </p>
            <p>
              Effective {grenadaTime(info.effective)} · Onset{" "}
              {grenadaTime(info.onset)} · Expires {grenadaTime(info.expires)}
            </p>
            <p>
              Areas:{" "}
              {(info.areas ?? []).map((area) => area.area_desc).join("; ") ||
                "None"}
            </p>
            <p className="whitespace-pre-wrap">{info.description}</p>
            {info.instruction ? (
              <p className="whitespace-pre-wrap">
                <strong>Instruction: </strong>
                {info.instruction}
              </p>
            ) : null}
            {source ? (
              <p>
                <strong>Source bulletin: </strong>
                {source.kind} · revision {source.revision}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/** The account may use the desk but not this screen. Says so; never hides it silently. */
export function DeskForbidden({
  permission,
  what,
}: {
  permission: string;
  what: string;
}) {
  return (
    <section className="space-y-3 py-10" role="alert">
      <h1 className="font-semibold text-2xl">No access to {what}</h1>
      <p className="text-muted-foreground">
        This screen needs the {permission} permission. Ask a GMS administrator
        for it. Nothing here has been changed.
      </p>
    </section>
  );
}

/** Shown while a desk screen's server data is still arriving. */
export function DeskLoading({ what }: { what: string }) {
  return (
    <p className="py-10 text-muted-foreground" role="status">
      Loading {what}…
    </p>
  );
}
