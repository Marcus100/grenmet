import type { Metadata } from "next";
import Link from "next/link";
import { FeedStatus } from "@/components/feed-status";
import {
  formatWhen,
  paginate,
  sortNewestFirst,
  toAlertView,
  WARNING_LEVEL_LABEL,
} from "@/lib/alerts";
import { fetchPast } from "@/lib/cap-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Past alerts" };

const PAGE_SIZE = 20;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page: requested } = await searchParams;
  const now = new Date();
  const result = await fetchPast();
  const hasData = result.status === "ok" || result.status === "stale";

  const views = hasData
    ? sortNewestFirst(result.data.flatMap((alert) => toAlertView(alert) ?? []))
    : [];
  const paging = paginate(
    views,
    Array.isArray(requested) ? requested[0] : requested,
    PAGE_SIZE
  );

  return (
    <div className="space-y-5">
      <h1 className="font-semibold text-gm-heading text-heading-lg">
        Past alerts
      </h1>
      <FeedStatus now={now} result={result} />
      {hasData && views.length === 0 ? (
        <p className="text-body text-gm-text-secondary">
          No past alerts are in the public record yet.
        </p>
      ) : null}
      {views.length > 0 ? (
        <>
          <ul className="divide-y divide-gm-border rounded-gm-card border border-gm-border">
            {paging.items.map((view) => (
              <li className="space-y-1 p-3" key={view.identifier}>
                <Link
                  className="font-semibold text-gm-blue-ink underline"
                  href={`/alerts/${encodeURIComponent(view.identifier)}`}
                  prefetch={false}
                >
                  {view.headline}
                </Link>
                <p className="text-body-sm text-gm-text-secondary">
                  {WARNING_LEVEL_LABEL[view.level]} ({view.severity}) · issued{" "}
                  {formatWhen(view.sent)}
                  {view.expires ? ` · ended ${formatWhen(view.expires)}` : ""}
                </p>
                <p className="text-body-sm text-gm-text-secondary">
                  {view.areas.join("; ")}
                </p>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Pages of past alerts"
            className="flex items-center justify-between text-body-sm"
          >
            {paging.page > 1 ? (
              <Link
                className="text-gm-blue-ink underline"
                href={`/history?page=${paging.page - 1}`}
                prefetch={false}
                rel="prev"
              >
                Newer alerts
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {paging.page} of {paging.pageCount} · {paging.total} alerts
            </span>
            {paging.page < paging.pageCount ? (
              <Link
                className="text-gm-blue-ink underline"
                href={`/history?page=${paging.page + 1}`}
                prefetch={false}
                rel="next"
              >
                Older alerts
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      ) : null}
    </div>
  );
}
