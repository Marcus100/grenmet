"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import type { SubscribedListView } from "@/lib/newsletter-preferences";
import { reportError } from "@/lib/report-error";

interface Props {
  initialLists: SubscribedListView[];
  token: string;
}

/**
 * The lists the reader is subscribed to, each with its own stop button. Stopping
 * one list leaves the others alone; the server returns what is left and this
 * list is replaced with that.
 */
export function NewsletterPreferences({ initialLists, token }: Props) {
  const [lists, setLists] = useState(initialLists);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function stop(listKey: string) {
    setBusyKey(listKey);
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, listKey }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        lists?: SubscribedListView[];
      };
      if (!(res.ok && body.lists)) {
        setMessage(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      setLists(body.lists);
      setMessage("You have stopped that list. Your other lists are unchanged.");
    } catch (error) {
      reportError(error, "gms-newsletter-preferences");
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  if (lists.length === 0) {
    return (
      <p className="text-body-base text-gm-heading" role="status">
        You are not subscribed to any list at the moment.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-gm-border">
        {lists.map((list) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 py-3"
            key={list.listKey}
          >
            <span className="text-body-base text-gm-heading">
              {list.listName}
            </span>
            <Button
              disabled={busyKey !== null}
              onClick={() => stop(list.listKey)}
              type="button"
              variant="outline"
            >
              {busyKey === list.listKey ? "Stopping…" : "Stop this list"}
            </Button>
          </li>
        ))}
      </ul>
      {message && (
        <p className="text-body-base text-gm-heading" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
