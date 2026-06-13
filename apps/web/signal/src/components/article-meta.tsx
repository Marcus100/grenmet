import { cn } from "@grenmet/ui/lib/utils";
import { formatRelativeTime } from "@/lib/format";

export function ArticleMeta({
  author,
  publishedAt,
  className,
}: {
  author: string;
  publishedAt: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[0.7rem] text-signal-muted uppercase tracking-wide",
        className
      )}
    >
      <span className="font-medium text-foreground/70">{author}</span>
      {" · "}
      <time dateTime={publishedAt}>{formatRelativeTime(publishedAt)}</time>
    </p>
  );
}
