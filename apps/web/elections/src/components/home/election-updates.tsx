import { Flag } from "@/components/flag";
import { SourceLink } from "@/components/source-link";
import type { CoverageUpdate } from "@/data/coverage";
import type { CampaignEvent, SourceRef } from "@/data/types";
import { formatIsoDate } from "@/lib/format";

interface Update {
  at: string;
  date: string;
  flag?: CampaignEvent["flag"];
  note?: string;
  sources: ({ id: string } | { label: string; url: string })[];
  text: string;
  title?: string;
}

/** Coverage posts and campaign events in one feed, newest first. */
export function ElectionUpdates({
  coverage,
  events,
  sources,
  limit = 5,
}: {
  coverage: CoverageUpdate[];
  events: CampaignEvent[];
  sources: Record<string, SourceRef>;
  limit?: number;
}) {
  const updates: Update[] = [
    ...coverage.map((p) => ({
      at: p.at,
      date: p.at.slice(0, 10),
      title: p.title,
      text: p.body,
      sources: p.sources,
    })),
    ...events
      .filter((e) => !e.future)
      .map((e) => ({
        at: `${e.date}T00:00:00-04:00`,
        date: e.date,
        text: e.text,
        flag: e.flag,
        ...(e.note ? { note: e.note } : {}),
        sources: [{ id: e.src }],
      })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);

  return (
    <ol className="divide-y divide-el-rule border-el-rule border-y">
      {updates.map((u) => (
        <li
          className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
          key={`${u.date}${u.text}`}
        >
          <time
            className="font-semibold text-el-muted text-xs tabular-nums sm:pt-1"
            dateTime={u.date}
          >
            {formatIsoDate(u.date)}
          </time>
          <div>
            {u.title && (
              <h3 className="font-bold font-serif text-lg leading-snug">
                {u.title}
              </h3>
            )}
            <p className={u.title ? "text-el-ink-2 text-sm" : ""}>
              {u.text}
              <Flag note={u.note} status={u.flag ?? null} />
            </p>
            {u.sources.length > 0 && (
              <p className="mt-0.5 text-el-muted text-xs">
                {u.sources.map((source, index) => (
                  <span key={"id" in source ? source.id : source.url}>
                    {index > 0 && "; "}
                    {"id" in source ? (
                      <SourceLink id={source.id} sources={sources} />
                    ) : (
                      <a
                        className="underline underline-offset-2"
                        href={source.url}
                        rel="noopener"
                        target="_blank"
                      >
                        {source.label}
                      </a>
                    )}
                  </span>
                ))}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
