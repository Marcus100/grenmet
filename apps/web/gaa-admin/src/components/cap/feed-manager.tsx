"use client";

import {
  type CapFeedImportPublic,
  capCreateFeed,
  capDeleteFeed,
  capUpdateFeed,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

function FeedForm({ feed }: { feed?: CapFeedImportPublic }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const suffix = feed?.id ?? "new";
  async function remove() {
    if (!feed || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await capDeleteFeed({ path: { feed_id: feed.id } }).unwrap();
      router.refresh();
    } catch {
      setMessage(
        "Deletion was not confirmed. Reload the list before retrying."
      );
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const element = event.currentTarget;
        const data = new FormData(element);
        const body = {
          name: String(data.get("name")),
          url: String(data.get("url")),
        };
        setBusy(true);
        setMessage("");
        try {
          if (feed)
            await capUpdateFeed({ path: { feed_id: feed.id }, body }).unwrap();
          else {
            await capCreateFeed({ body }).unwrap();
            element.reset();
          }
          setMessage("Feed saved.");
          router.refresh();
        } catch {
          setMessage(
            "Save was not confirmed. Check permissions and the feed URL; reload before retrying."
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">{feed ? feed.name : "Add feed source"}</h2>
      <fieldset className="space-y-3" disabled={busy}>
        <Label htmlFor={`feed-name-${suffix}`}>Name</Label>
        <Input
          defaultValue={feed?.name}
          id={`feed-name-${suffix}`}
          maxLength={255}
          name="name"
          required
        />
        <Label htmlFor={`feed-url-${suffix}`}>Feed URL</Label>
        <Input
          defaultValue={feed?.url}
          id={`feed-url-${suffix}`}
          maxLength={1000}
          name="url"
          required
          type="url"
        />
        {feed ? (
          <p>
            Status: {feed.status} · Last checked:{" "}
            {feed.last_checked_at ?? "Not yet reported"}
            {feed.last_error ? ` · ${feed.last_error}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{busy ? "Working…" : "Save feed"}</Button>
          {feed ? (
            <Button
              onClick={() => setConfirmDelete(true)}
              type="button"
              variant="outline"
            >
              Delete feed
            </Button>
          ) : null}
        </div>
        {confirmDelete ? (
          <fieldset aria-label="Confirm feed deletion" className="space-y-2">
            <p>Delete {feed?.name}? This removes the feed configuration.</p>
            <Button onClick={remove} type="button">
              Confirm deletion
            </Button>
            <Button
              onClick={() => setConfirmDelete(false)}
              type="button"
              variant="outline"
            >
              Keep feed
            </Button>
          </fieldset>
        ) : null}
      </fieldset>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

export function CapFeedManager({ feeds }: { feeds: CapFeedImportPublic[] }) {
  return (
    <div className="space-y-4">
      <p>
        Register external CAP sources. A saved source does not confirm
        successful ingestion or publication.
      </p>
      <FeedForm />
      {feeds.length === 0 ? <p>No feed sources configured.</p> : null}
      {feeds.map((feed) => (
        <FeedForm feed={feed} key={`${feed.id}-${feed.updated_at}`} />
      ))}
    </div>
  );
}
