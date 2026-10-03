import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import {
  getGroupById,
  getViewer,
  listProfiles,
  listThreads,
} from "@/data/discovery";
import type { MessageThread, Profile } from "@/domain/types";
import { formatTime } from "@/lib/datetime";
import { PersonAvatar } from "./person-avatar";

export async function threadTitle(
  thread: MessageThread,
  viewer: Profile,
  profiles: readonly Profile[]
): Promise<string> {
  if (thread.kind === "group" && thread.groupId) {
    return (await getGroupById(thread.groupId))?.name ?? "Group chat";
  }
  const otherId = thread.participantIds.find((id) => id !== viewer.id);
  return (
    profiles.find((profile) => profile.id === otherId)?.name ?? "Conversation"
  );
}

export async function ThreadList({ activeId }: { activeId?: string }) {
  const [viewer, profiles] = await Promise.all([getViewer(), listProfiles()]);
  const threads = await listThreads(viewer.id);
  const rows = await Promise.all(
    threads.map(async (thread) => ({
      thread,
      title: await threadTitle(thread, viewer, profiles),
    }))
  );

  if (rows.length === 0) {
    return (
      <p className="text-body text-muted-foreground">No conversations yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map(({ thread, title }) => {
        const last = thread.messages.at(-1);
        return (
          <li key={thread.id}>
            <Link
              aria-current={activeId === thread.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 p-4 hover:bg-muted",
                activeId === thread.id && "bg-muted"
              )}
              href={`/messages/${thread.id}`}
            >
              <PersonAvatar name={title} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-medium text-body">{title}</p>
                  {last ? (
                    <p className="shrink-0 text-caption text-muted-foreground">
                      {formatTime(last.sentAt)}
                    </p>
                  ) : null}
                </div>
                <p className="truncate text-caption text-muted-foreground">
                  {thread.kind === "group" ? "Group · " : ""}
                  {last?.body}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
