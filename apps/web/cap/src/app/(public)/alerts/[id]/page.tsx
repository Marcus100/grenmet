import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertFacts, AlertTimes, LevelStrip } from "@/components/alert-card";
import { FeedStatus, Unreachable } from "@/components/feed-status";
import { PrintButton } from "@/components/print-button";
import { formatWhen, toAlertView } from "@/lib/alerts";
import { fetchAlert } from "@/lib/cap-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Alert details" };

export default async function AlertPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identifier = safeDecode(id);
  const now = new Date();
  const result = await fetchAlert(identifier);

  if (result.status === "not-found") {
    notFound();
  }
  if (result.status === "unavailable") {
    return <Unreachable />;
  }

  const alert = result.data;
  const view = toAlertView(alert);
  if (!view) {
    notFound();
  }

  const ended =
    alert.lifecycle_state === "EXPIRED" ||
    alert.lifecycle_state === "CANCELLED" ||
    alert.msg_type === "Cancel" ||
    (view.expires !== null && Date.parse(view.expires) <= now.getTime());
  const xmlHref = `/feeds/alerts/${encodeURIComponent(view.identifier)}.xml`;

  return (
    <article className="space-y-5">
      <FeedStatus now={now} result={result} />
      <div className="overflow-hidden rounded-gm-card border border-gm-border">
        <LevelStrip view={view} />
        <div className="space-y-4 p-4">
          <h1 className="font-semibold text-gm-heading text-heading-lg">
            {view.headline}
          </h1>
          {ended ? (
            <p
              className="rounded-gm-card border border-gm-border bg-gm-surface p-3 font-semibold text-body-sm"
              role="status"
            >
              This alert is no longer in force.
              {alert.cancellation_reason
                ? ` Reason: ${alert.cancellation_reason}`
                : ""}
              {alert.replaced_by_identifier ? (
                <>
                  {" "}
                  Replaced by{" "}
                  <Link
                    className="text-gm-blue-ink underline"
                    href={`/alerts/${encodeURIComponent(alert.replaced_by_identifier)}`}
                  >
                    {alert.replaced_by_identifier}
                  </Link>
                  .
                </>
              ) : null}
            </p>
          ) : null}
          {view.status === "Actual" ? null : (
            <p className="font-semibold text-body-sm uppercase tracking-wide">
              {view.status} message, not a live warning
            </p>
          )}
          <AlertFacts view={view} />
          <AlertTimes view={view} />
          <p className="text-body-sm">
            <span className="text-gm-text-muted">Areas: </span>
            {view.areas.length > 0 ? view.areas.join("; ") : "Not specified"}
          </p>
          <section aria-labelledby="what">
            <h2
              className="font-semibold text-gm-heading text-heading-sm"
              id="what"
            >
              What is happening
            </h2>
            <p className="mt-1 whitespace-pre-line text-body">
              {view.description}
            </p>
          </section>
          {view.instruction ? (
            <section aria-labelledby="do">
              <h2
                className="font-semibold text-gm-heading text-heading-sm"
                id="do"
              >
                What to do
              </h2>
              <p className="mt-1 whitespace-pre-line text-body">
                {view.instruction}
              </p>
            </section>
          ) : null}
          <p className="text-body-sm text-gm-text-secondary">
            Issued by the Grenada Meteorological Service,{" "}
            {formatWhen(view.sent)} (Grenada time). Reference {view.identifier}.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <a
          className="font-medium text-body-sm text-gm-blue-ink underline"
          href={xmlHref}
        >
          CAP XML for this alert
        </a>
        <PrintButton />
        <Link className="text-body-sm text-gm-blue-ink underline" href="/">
          All active alerts
        </Link>
      </div>
    </article>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
