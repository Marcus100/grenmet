import Link from "next/link";
import {
  type AlertView,
  endedTime,
  formatWhen,
  isInForce,
  WARNING_LEVEL_SURFACE,
  warningLevelHeading,
} from "@/lib/alerts";

/** Severity, urgency and certainty as words: colour is never the only signal. */
export function AlertFacts({ view }: { view: AlertView }) {
  return (
    <dl className="text-body-sm grid grid-cols-3 gap-2">
      <Fact label="Severity" value={view.severity} />
      <Fact label="Urgency" value={view.urgency} />
      <Fact label="Certainty" value={view.certainty} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gm-text-muted text-label tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-gm-text-primary font-semibold">{value}</dd>
    </div>
  );
}

export function AlertTimes({ view }: { view: AlertView }) {
  return (
    <dl className="text-body-sm grid grid-cols-2 gap-2">
      <div>
        <dt className="text-gm-text-muted text-label tracking-wide uppercase">
          Effective
        </dt>
        <dd className="text-gm-text-primary">{formatWhen(view.effective)}</dd>
      </div>
      <div>
        <dt className="text-gm-text-muted text-label tracking-wide uppercase">
          Expires
        </dt>
        <dd className="text-gm-text-primary">{formatWhen(view.expires)}</dd>
      </div>
    </dl>
  );
}

/**
 * Strip across the top of a card, naming the issued colour and the action
 * words. An ended alert gets a grey strip that leads with "Ended" and the
 * time it ended; the issued colour shrinks to a small tag.
 */
export function LevelStrip({
  ended = false,
  view,
}: {
  ended?: boolean;
  view: AlertView;
}) {
  if (ended) {
    const when = endedTime(view);
    return (
      <div
        className={`text-body flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 ${WARNING_LEVEL_SURFACE.unknown}`}
      >
        <p className="font-bold tracking-wide uppercase">
          Ended{when ? ` · ${formatWhen(when)}` : ""}
        </p>
        {view.replacedBy ? (
          <p className="text-body-sm">
            Replaced by{" "}
            <Link
              className="underline"
              href={`/alerts/${encodeURIComponent(view.replacedBy)}`}
              prefetch={false}
            >
              the newer warning
            </Link>
          </p>
        ) : null}
        <span
          className={`text-label rounded px-2 py-0.5 font-bold tracking-wide uppercase ${WARNING_LEVEL_SURFACE[view.level]}`}
        >
          Was {warningLevelHeading(view.level)}
        </span>
      </div>
    );
  }
  return (
    <p
      className={`text-body px-4 py-2 font-bold tracking-wide uppercase ${WARNING_LEVEL_SURFACE[view.level]}`}
    >
      <span aria-hidden="true">! </span>
      {warningLevelHeading(view.level)} · {view.event}
    </p>
  );
}

export function AlertCard({
  view,
  heading: Heading = "h3",
  now,
}: {
  view: AlertView;
  heading?: "h2" | "h3";
  now: Date;
}) {
  return (
    <article className="rounded-gm-card border-gm-border bg-gm-surface-page overflow-hidden border">
      <LevelStrip ended={!isInForce(view, now)} view={view} />
      <div className="space-y-3 p-4">
        <Heading className="text-gm-heading text-heading-sm font-semibold">
          <Link
            className="underline-offset-4 hover:underline"
            href={`/alerts/${encodeURIComponent(view.identifier)}`}
            prefetch={false}
          >
            {view.headline}
          </Link>
        </Heading>
        {view.status === "Actual" ? null : (
          <p className="text-body-sm font-semibold tracking-wide uppercase">
            {view.status} message, not a live warning
          </p>
        )}
        <AlertFacts view={view} />
        <p className="text-body-sm">
          <span className="text-gm-text-muted">Areas: </span>
          {view.areas.length > 0 ? view.areas.join("; ") : "Not specified"}
        </p>
        <AlertTimes view={view} />
        <p className="text-body text-gm-text-secondary line-clamp-3">
          {view.description}
        </p>
        <Link
          className="text-body-sm text-gm-blue-ink inline-block font-medium underline"
          href={`/alerts/${encodeURIComponent(view.identifier)}`}
          prefetch={false}
        >
          Full alert and advice
        </Link>
      </div>
    </article>
  );
}
