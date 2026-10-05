"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { SendHorizontal } from "lucide-react";
import { useState } from "react";
import { sendMessage } from "@/data/actions";
import { useMemberAction } from "./use-member-action";

/** Sends to a thread; the server re-checks the messaging safety rule. */
export function MessageComposer({
  disabled,
  threadId,
}: {
  disabled: boolean;
  threadId: string;
}) {
  const [draft, setDraft] = useState("");
  const { error, pending, perform } = useMemberAction();

  const send = async () => {
    const body = draft.trim();
    if (!body || pending) {
      return;
    }
    const result = await perform(() => sendMessage(threadId, body));
    if (result.ok) {
      setDraft("");
    }
  };

  return (
    <>
      {error ? (
        <p className="mt-3 text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
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
          maxLength={4000}
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
          disabled={disabled || pending || !draft.trim()}
          size="icon-lg"
          type="submit"
        >
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}
