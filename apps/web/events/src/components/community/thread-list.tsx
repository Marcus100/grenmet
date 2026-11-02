import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { listThreads } from "@/data/events-api";
import { formatTime } from "@/lib/datetime";
import { PersonAvatar } from "./person-avatar";

export async function ThreadList({ activeId }: { activeId?: string }) {
  const threads = await listThreads();

  if (threads.length === 0) {
    return (
      <p className="text-body text-muted-foreground">No conversations yet.</p>
    );
  }

  return (
    <ul className="divide-border border-border bg-card divide-y overflow-hidden rounded-2xl border">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            aria-current={activeId === thread.id ? "page" : undefined}
            className={cn(
              "hover:bg-muted flex items-center gap-3 p-4",
              activeId === thread.id && "bg-muted"
            )}
            href={`/messages/${thread.id}`}
          >
            <PersonAvatar name={thread.title} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-body truncate font-medium">{thread.title}</p>
                {thread.lastSentAt ? (
                  <p className="text-caption text-muted-foreground shrink-0">
                    {formatTime(thread.lastSentAt)}
                  </p>
                ) : null}
              </div>
              <p className="text-caption text-muted-foreground truncate">
                {thread.kind === "group" ? "Group · " : ""}
                {thread.lastMessage}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
