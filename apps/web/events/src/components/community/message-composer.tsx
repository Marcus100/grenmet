"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { SendHorizontal } from "lucide-react";
import { useState } from "react";
import { formatTime } from "@/lib/datetime";

interface LocalMessage {
  readonly body: string;
  readonly id: number;
  readonly sentAt: string;
}

/** Demo composer: messages stay in this tab until messaging has a backend. */
export function MessageComposer({ disabled }: { disabled: boolean }) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<LocalMessage[]>([]);

  const send = () => {
    const body = draft.trim();
    if (!body) {
      return;
    }
    setSent((messages) => [
      ...messages,
      { id: messages.length, body, sentAt: new Date().toISOString() },
    ]);
    setDraft("");
  };

  return (
    <>
      {sent.map((message) => (
        <div className="flex justify-end" key={message.id}>
          <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
            <p className="text-body">{message.body}</p>
            <p className="mt-1 text-caption opacity-80">
              {formatTime(message.sentAt)} · demo only
            </p>
          </div>
        </div>
      ))}
      <form
        className="sticky bottom-20 mt-4 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 lg:bottom-4"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor="message-draft">
          Message
        </label>
        <Textarea
          className="min-h-11 flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
          disabled={disabled}
          id="message-draft"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={
            disabled ? "You can't message this person" : "Write a message"
          }
          rows={1}
          value={draft}
        />
        <Button
          aria-label="Send"
          disabled={disabled || !draft.trim()}
          size="icon-lg"
          type="submit"
        >
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}
