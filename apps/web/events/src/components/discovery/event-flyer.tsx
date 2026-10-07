import { cn } from "@barrelsgd/ui/lib/utils";
import { CATEGORY_LABELS } from "@/domain/labels";
import type { EventCategory } from "@/domain/types";
import { dateStamp } from "@/lib/datetime";
import { CATEGORY_STYLE } from "./category-style";

/**
 * Stand-in artwork until organisers upload flyers: a category-toned panel
 * with a date stamp. Decorative; the card carries the accessible text.
 */
export function EventFlyer({
  category,
  className,
  startsAt,
  title,
}: {
  category: EventCategory;
  className?: string;
  startsAt: string;
  title?: string;
}) {
  const { icon: Icon, tone } = CATEGORY_STYLE[category];
  const stamp = dateStamp(startsAt);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative isolate flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-2xl p-4",
        tone,
        className
      )}
    >
      <Icon
        className="absolute -right-6 -bottom-6 -z-10 size-40 opacity-15"
        strokeWidth={1.5}
      />
      <span className="w-fit rounded-full bg-black/15 px-2.5 py-1 font-medium text-caption">
        {CATEGORY_LABELS[category]}
      </span>
      <div className="flex items-end justify-between gap-3">
        {title ? (
          <p className="line-clamp-2 font-display font-semibold text-heading-sm leading-tight">
            {title}
          </p>
        ) : (
          <span />
        )}
        <span className="flex shrink-0 flex-col items-center rounded-xl bg-white px-3 py-1.5 text-events-ink leading-none">
          <span className="font-semibold text-caption uppercase">
            {stamp.month}
          </span>
          <span className="font-bold font-display text-heading-sm">
            {stamp.day}
          </span>
        </span>
      </div>
    </div>
  );
}
