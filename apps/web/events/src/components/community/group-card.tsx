import { cn } from "@barrelsgd/ui/lib/utils";
import { Lock } from "lucide-react";
import Link from "next/link";
import { CATEGORY_STYLE } from "@/components/discovery/category-style";
import { PARISH_LABELS } from "@/domain/labels";
import type { Group } from "@/domain/types";

export function GroupCard({
  group,
  memberCount,
  nextMeetup,
}: {
  group: Group;
  memberCount: number;
  nextMeetup: string | null;
}) {
  const { icon: Icon, tone } = CATEGORY_STYLE[group.category];

  return (
    <Link
      className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground"
      href={`/groups/${group.slug}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            tone
          )}
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-body-base group-hover:underline">
            {group.name}
          </h2>
          <p className="flex items-center gap-1 text-caption text-muted-foreground">
            {memberCount} members · {PARISH_LABELS[group.parish]}
            {group.joinPolicy === "approval" ? (
              <Lock aria-label="Membership reviewed" className="size-3.5" />
            ) : null}
          </p>
        </div>
      </div>
      <p className="flex-1 text-body text-muted-foreground">{group.tagline}</p>
      <p className="font-medium text-caption text-events-hibiscus-deep">
        {nextMeetup ? `Next: ${nextMeetup}` : "No meetup scheduled"}
      </p>
    </Link>
  );
}
