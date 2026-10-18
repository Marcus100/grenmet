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
    <dl className="grid grid-cols-3 gap-2 text-body-sm">
      <Fact label="Severity" value={view.severity} />
      <Fact label="Urgency" value={view.urgency} />
      <Fact label="Certainty" value={view.certainty} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gm-text-muted text-label uppercase tracking-wide">
        {label}
      </dt>
      <dd className="font-semibold text-gm-text-primary">{value}</dd>
    </div>
  );
}

export function AlertTimes({ view }: { view: AlertView }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-body-sm">
      <div>
        <dt className="text-gm-text-muted text-label uppercase tracking-wide">
          Effective
        </dt>
        <dd className="text-gm-text-primary">{formatWhen(view.effective)}</dd>
      </div>
      <div>
        <dt className="text-gm-text-muted text-label uppercase tracking-wide">
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
      className={`px-4 py-2 font-bold text-body uppercase tracking-wide ${WARNING_LEVEL_SURFACE[view.level]}`}
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
    <article className="overflow-hidden rounded-gm-card border border-gm-border bg-gm-surface-page">
      <LevelStrip view={view} />
      <div className="space-y-3 p-4">
        <Heading className="font-semibold text-gm-heading text-heading-sm">
          <Link
            className="underline-offset-4 hover:underline"
            href={`/alerts/${encodeURIComponent(view.identifier)}`}
            prefetch={false}
          >
            {view.headline}
          </Link>
        </Heading>
        {view.status === "Actual" ? null : (
          <p className="font-semibold text-body-sm uppercase tracking-wide">
            {view.status} message, not a live warning
          </p>
        )}
        <AlertFacts view={view} />
        <p className="text-body-sm">
          <span className="text-gm-text-muted">Areas: </span>
          {view.areas.length > 0 ? view.areas.join("; ") : "Not specified"}
        </p>
        <AlertTimes view={view} />
        <p className="line-clamp-3 text-body text-gm-text-secondary">
          {view.description}
        </p>
        <Link
          className="inline-block font-medium text-body-sm text-gm-blue-ink underline"
          href={`/alerts/${encodeURIComponent(view.identifier)}`}
          prefetch={false}
        >
          Full alert and advice
        </Link>
      </div>
    </article>
  );
}
