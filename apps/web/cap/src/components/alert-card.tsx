import Link from "next/link";
import {
  type AlertView,
  formatWhen,
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_SURFACE,
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

/** Strip across the top of a card, naming the level in words. */
export function LevelStrip({ view }: { view: AlertView }) {
  return (
    <p
      className={`text-body px-4 py-2 font-bold tracking-wide uppercase ${WARNING_LEVEL_SURFACE[view.level]}`}
    >
      <span aria-hidden="true">! </span>
      {WARNING_LEVEL_LABEL[view.level]} · {view.event}
    </p>
  );
}

export function AlertCard({
  view,
  heading: Heading = "h3",
}: {
  view: AlertView;
  heading?: "h2" | "h3";
}) {
  return (
    <article className="rounded-gm-card border-gm-border bg-gm-surface-page overflow-hidden border">
      <LevelStrip view={view} />
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
