import Link from "next/link";
import { AlertCard } from "@/components/alert-card";
import { FeedStatus } from "@/components/feed-status";
import {
  overallLevel,
  splitActive,
  statusLine,
  WARNING_LEVEL_SURFACE,
} from "@/lib/alerts";
import { fetchActive } from "@/lib/cap-api";
import { env } from "@/lib/env";

// Rendered per request so a build never bakes in a feed answer; the edge
// caches the result for a minute (next.config.ts).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  const result = await fetchActive();
  const hasData = result.status === "ok" || result.status === "stale";
  const { actual, exercise } = hasData
    ? splitActive(result.data, now)
    : { actual: [], exercise: [] };

  return (
    <div className="space-y-6">
      <h1 className="text-gm-heading text-heading-lg font-semibold">
        Active weather alerts
      </h1>

      <FeedStatus now={now} result={result} />

      {hasData ? (
        <section aria-labelledby="status-heading" className="space-y-4">
          <h2 className="sr-only" id="status-heading">
            Current status
          </h2>
          <p
            className={`rounded-gm-card text-heading-sm p-4 font-bold ${WARNING_LEVEL_SURFACE[overallLevel(actual)]}`}
          >
            {statusLine(actual)}
          </p>

          {exercise.length > 0 ? (
            <div
              className="rounded-gm-card border-gm-border bg-gm-surface text-body-sm border p-3"
              role="status"
            >
              <strong>Exercise or test in progress.</strong> The{" "}
              {exercise.length} message{exercise.length === 1 ? "" : "s"} marked
              as exercise or test below are not live warnings.
            </div>
          ) : null}

          {actual.length === 0 ? (
            <p className="text-body text-gm-text-secondary">
              There are no weather alerts in effect for Grenada, Carriacou and
              Petite Martinique at the time shown above.
            </p>
          ) : (
            <ul className="space-y-4">
              {actual.map((view) => (
                <li key={view.identifier}>
                  <AlertCard heading="h2" view={view} />
                </li>
              ))}
            </ul>
          )}

          {exercise.length > 0 ? (
            <ul className="space-y-4">
              {exercise.map((view) => (
                <li key={view.identifier}>
                  <AlertCard heading="h2" view={view} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <nav aria-label="More ways to see alerts" className="text-body-sm">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          <li>
            <Link className="text-gm-blue-ink underline" href="/map">
              See alerts on a map
            </Link>
          </li>
          <li>
            <Link className="text-gm-blue-ink underline" href="/history">
              Past alerts
            </Link>
          </li>
          <li>
            <Link className="text-gm-blue-ink underline" href="/feeds">
              Feeds for apps and agencies
            </Link>
          </li>
          <li>
            <a
              className="text-gm-blue-ink underline"
              href={`${env.GMS_SITE_URL}/alerts/get-alerts`}
            >
              How to get alerts
            </a>
          </li>
        </ul>
      </nav>
    </div>
  );
}
