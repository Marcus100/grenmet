import { cn } from "@barrelsgd/ui/lib/utils";
import { formatLongDate } from "@/lib/format";

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
    <p className={cn("text-signal-muted text-sm leading-relaxed", className)}>
      <span className="font-medium text-foreground">{author}</span>
      {" · "}
      <time dateTime={publishedAt}>{formatLongDate(publishedAt)}</time>
    </p>
  );
}
