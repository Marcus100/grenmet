import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { cn } from "@barrelsgd/ui/lib/utils";
import { MapPin, Repeat } from "lucide-react";
import Link from "next/link";
import { GoingAvatars } from "@/components/community/person-avatar";
import { PARISH_LABELS, priceLabel } from "@/domain/labels";
import type { PublicEvent } from "@/domain/types";
import { formatEventDate } from "@/lib/datetime";
import { EventFlyer } from "./event-flyer";
import { SaveButton } from "./save-button";

export interface EventCardData
  extends Pick<
    PublicEvent,
    | "admission"
    | "category"
    | "goingCount"
    | "goingNames"
    | "parish"
    | "priceFrom"
    | "recurrence"
    | "slug"
    | "startsAt"
    | "title"
    | "venue"
    | "viewerSaved"
  > {}

export function EventCard({
  event,
  highlight,
  href,
  layout = "stacked",
}: {
  event: EventCardData;
  /** A lime "happening" label such as "Tonight". */
  highlight?: string;
  /** Overrides the link target, e.g. a preview with no live page. */
  href?: string | null;
  layout?: "stacked" | "row";
}) {
  const body = (
    <article
      className={cn(
        "group flex h-full gap-4",
        layout === "stacked" ? "flex-col" : "flex-row items-start"
      )}
    >
      <EventFlyer
        category={event.category}
        className={cn(
          "transition-transform group-hover:-translate-y-0.5",
          layout === "row" && "w-32 shrink-0 sm:w-44"
        )}
        startsAt={event.startsAt}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {highlight ? (
            <Badge
              className="bg-events-lime text-events-ink"
              variant="secondary"
            >
              {highlight}
            </Badge>
          ) : null}
          <span className="font-medium text-caption text-events-hibiscus-deep">
            {formatEventDate(event.startsAt)}
          </span>
        </div>
        <h3 className="font-display font-semibold text-body-base leading-snug group-hover:underline">
          {event.title}
        </h3>
        <p className="flex items-center gap-1 text-caption text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {event.venue} · {PARISH_LABELS[event.parish]}
          </span>
        </p>
        {event.recurrence ? (
          <p className="flex items-center gap-1 text-caption text-muted-foreground">
            <Repeat className="size-3.5 shrink-0" />
            {event.recurrence}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <GoingAvatars names={event.goingNames} total={event.goingCount} />
          <span className="shrink-0 font-semibold text-caption">
            {priceLabel(event)}
          </span>
        </div>
      </div>
    </article>
  );

  if (href === null) {
    return body;
  }

  // The save button is a sibling of the link, not inside it: interactive
  // elements must not nest inside an anchor.
  return (
    <div className="relative h-full">
      <Link
        className="block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
        href={href ?? `/events/${event.slug}`}
      >
        {body}
      </Link>
      <SaveButton
        className={cn(
          "absolute top-3",
          layout === "row" ? "left-20 sm:left-32" : "right-3"
        )}
        initiallySaved={event.viewerSaved ?? false}
        slug={event.slug}
        title={event.title}
      />
    </div>
  );
}
