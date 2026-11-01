"use client";

import type { CapFeedImportPublic } from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { createFeed, deleteFeed, updateFeed } from "@/app/desk/feeds/actions";
import { grenadaTime } from "@/components/desk/desk-panels";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import type { DeskError } from "@/lib/desk/errors";

interface FeedValues {
  name: string;
  url: string;
}

function readValues(form: FormData): FeedValues {
  return {
    name: String(form.get("name") ?? "").trim(),
    url: String(form.get("url") ?? "").trim(),
  };
}

/**
 * One feed source: a name and URL form, plus delete behind a confirmation.
 * `feed` is absent for the "add" form. Each save goes through a server action
 * that checks `cap.feed.manage` before FastAPI is called.
 */
function FeedForm({ feed }: { feed?: CapFeedImportPublic }) {
  const router = useRouter();
  const idPrefix = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<DeskError | null>(null);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save(values: FeedValues, reset: () => void) {
    setError(null);
    setMessage("");
    startTransition(async () => {
      const result = feed
        ? await updateFeed(feed.id, values)
        : await createFeed(values);
      if (result.ok) {
        setMessage(feed ? "Feed saved." : "Feed added.");
        if (!feed) reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    if (!feed) return;
    setConfirmDelete(false);
    setError(null);
    setMessage("");
    startTransition(async () => {
      const result = await deleteFeed(feed.id);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const element = event.currentTarget;
          save(readValues(new FormData(element)), () => element.reset());
        }}
      >
        <h2 className="font-semibold">
          {feed ? feed.name : "Add a feed source"}
        </h2>
        <fieldset className="space-y-3" disabled={pending}>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-name`}>Name</Label>
            <Input
              defaultValue={feed?.name}
              id={`${idPrefix}-name`}
              maxLength={255}
              name="name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-url`}>Feed URL</Label>
            <Input
              defaultValue={feed?.url}
              id={`${idPrefix}-url`}
              maxLength={1000}
              name="url"
              required
              type="url"
            />
          </div>
          {feed ? (
            <p className="text-body-sm text-muted-foreground">
              Status: {feed.status} · Last checked:{" "}
              {feed.last_checked_at
                ? grenadaTime(feed.last_checked_at)
                : "Not yet reported"}
              {feed.last_error ? ` · Last error: ${feed.last_error}` : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit">
              {pending ? "Working…" : feed ? "Save feed" : "Add feed"}
            </Button>
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
        </fieldset>
      </form>
      <DeskErrorNotice error={error} />
      {message ? (
        <p className="text-body-sm" role="status">
          {message}
        </p>
      ) : null}
      {feed ? (
        <AlertDialog
          onOpenChange={(open) => {
            if (!open) setConfirmDelete(false);
          }}
          open={confirmDelete}
        >
          <AlertDialogContent>
            <AlertDialogTitle>Delete {feed.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the feed configuration and stops its scheduled
              ingestion.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep feed</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>
                Delete feed
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}

/** Every external CAP source, plus a form to add one. Empty is said plainly. */
export function FeedManager({ feeds }: { feeds: CapFeedImportPublic[] }) {
  return (
    <div className="space-y-6">
      <p className="text-body-sm text-muted-foreground">
        External CAP sources the warning service reads on a schedule. A saved
        source does not confirm that any alert has been ingested or published.
      </p>
      <FeedForm />
      {feeds.length === 0 ? (
        <p className="text-muted-foreground">No feed sources configured.</p>
      ) : null}
      {feeds.map((feed) => (
        <FeedForm feed={feed} key={`${feed.id}-${feed.updated_at}`} />
      ))}
    </div>
  );
}
