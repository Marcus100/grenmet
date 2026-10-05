import { cn } from "@barrelsgd/ui/lib/utils";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageComposer } from "@/components/community/message-composer";
import { PersonAvatar } from "@/components/community/person-avatar";
import { getThread } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { formatEventDate } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false },
};

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  await requireViewer(`/messages/${threadId}`);
  const thread = await getThread(threadId);
  if (!thread) {
    notFound();
  }
  const { title } = thread;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3 border-border border-b pb-4">
        <Link
          aria-label="Back to messages"
          className="rounded-full p-2 hover:bg-muted"
          href="/messages"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <PersonAvatar name={title} />
        <div className="min-w-0">
          <h1 className="truncate font-display font-semibold text-body-base">
            {title}
          </h1>
          <p className="text-caption text-muted-foreground">
            {thread.kind === "group"
              ? `${thread.participants.length} members`
              : "Direct message"}
          </p>
        </div>
      </div>
      <p className="mb-4 flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
        <ShieldCheck className="size-4" />
        Only connections and group members can message you. Report anything that
        feels off.
      </p>
      <ol className="space-y-3">
        {thread.messages.map((message) => {
          const { mine } = message;
          return (
            <li
              className={cn("flex", mine ? "justify-end" : "justify-start")}
              key={message.id}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5",
                  mine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-card ring-1 ring-border"
                )}
              >
                {thread.kind === "group" && !mine ? (
                  <p className="font-semibold text-caption text-events-sea">
                    {message.author?.name ?? "Member"}
                  </p>
                ) : null}
                <p className="text-body">{message.body}</p>
                <p
                  className={cn(
                    "mt-1 text-caption",
                    mine ? "opacity-80" : "text-muted-foreground"
                  )}
                >
                  {formatEventDate(message.sentAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="space-y-3">
        <MessageComposer disabled={!thread.canSend} threadId={thread.id} />
      </div>
    </div>
  );
}
