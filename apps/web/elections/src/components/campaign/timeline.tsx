import { cn } from "@barrelsgd/ui/lib/utils";
import { Flag } from "@/components/flag";
import { SourceLink } from "@/components/source-link";
import type { CampaignEvent, SourceRef } from "@/data/types";
import { formatIsoDate } from "@/lib/format";

/** Events since 2022: filled dots have happened, hollow dots are to come. */
export function CampaignTimeline({
  events,
  sources,
}: {
  events: CampaignEvent[];
  sources: Record<string, SourceRef>;
}) {
  return (
    <ol className="relative border-el-rule border-l pl-5">
      {events.map((event) => (
        <li className="pb-5 last:pb-0" key={`${event.date}${event.text}`}>
          <span
            aria-hidden="true"
            className={cn(
              "absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2",
              event.future
                ? "border-el-ink bg-background"
                : "border-background bg-el-ink"
            )}
          />
          <p className="font-semibold text-el-muted text-xs tabular-nums">
            <time dateTime={event.date}>{formatIsoDate(event.date)}</time>
            {event.future && " · to come"}
          </p>
          <p className="mt-0.5">
            {event.text}
            <Flag note={event.note} status={event.flag} />
          </p>
          <p className="mt-0.5 text-el-muted text-xs">
            <SourceLink id={event.src} sources={sources} />
            {event.note && ` · ${event.note}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
