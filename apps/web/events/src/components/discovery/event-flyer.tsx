import { cn } from "@barrelsgd/ui/lib/utils";
import Image from "next/image";
import { CATEGORY_LABELS } from "@/domain/labels";
import type { EventCategory } from "@/domain/types";
import { dateStamp } from "@/lib/datetime";
import { storedImageUrl } from "@/lib/stored-image";
import { CATEGORY_STYLE } from "./category-style";

/**
 * The event's cover: the organiser's stored image when there is one (served
 * from the public `/files/{id}` route, never a bucket address), otherwise a
 * category-toned panel with a date stamp. The box keeps its aspect ratio
 * either way so the page does not shift, and the panel sits under the image so
 * a failed load still shows something. The text on the panel is decorative;
 * the card carries the accessible text.
 */
export function EventFlyer({
  category,
  className,
  imageAlt = "Event cover image",
  imageFileId,
  priority = false,
  startsAt,
  title,
}: {
  category: EventCategory;
  className?: string;
  /** Alt text for the stored cover image. */
  imageAlt?: string;
  /** Stored cover image; the panel shows without it. */
  imageFileId?: string | null;
  /** Above-the-fold image: load it eagerly instead of lazily. */
  priority?: boolean;
  startsAt: string;
  title?: string;
}) {
  const { icon: Icon, tone } = CATEGORY_STYLE[category];
  const stamp = dateStamp(startsAt);

  const panel = (
    <div
      aria-hidden="true"
      className={cn(
        "relative isolate flex size-full flex-col justify-between overflow-hidden p-4",
        tone
      )}
    >
      <Icon
        className="absolute -right-6 -bottom-6 -z-10 size-40 opacity-15"
        strokeWidth={1.5}
      />
      <span className="text-caption w-fit rounded-full bg-black/15 px-2.5 py-1 font-medium">
        {CATEGORY_LABELS[category]}
      </span>
      <div className="flex items-end justify-between gap-3">
        {title ? (
          <p className="font-display text-heading-sm line-clamp-2 leading-tight font-semibold">
            {title}
          </p>
        ) : (
          <span />
        )}
        <span className="text-events-ink flex shrink-0 flex-col items-center rounded-xl bg-white px-3 py-1.5 leading-none">
          <span className="text-caption font-semibold uppercase">
            {stamp.month}
          </span>
          <span className="font-display text-heading-sm font-bold">
            {stamp.day}
          </span>
        </span>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-2xl",
        className
      )}
    >
      {panel}
      {imageFileId ? (
        <Image
          alt={imageAlt}
          className="absolute inset-0 size-full object-cover text-transparent"
          height={480}
          loading={priority ? "eager" : "lazy"}
          sizes="(min-width: 1024px) 24rem, 100vw"
          src={storedImageUrl(imageFileId)}
          unoptimized
          width={640}
        />
      ) : null}
    </div>
  );
}
