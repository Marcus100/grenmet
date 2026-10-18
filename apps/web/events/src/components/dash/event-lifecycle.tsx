"use client";

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
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { cancelEvent, postponeEvent } from "@/data/actions";
import { draftEndsAt, draftStartsAt } from "./event-draft";

/**
 * Cancel or postpone a published event. Cancelling cancels every valid ticket
 * and tells going, saved and ticket-holding members; outlet cash tickets can
 * then be refunded from the outlet screen. Postponing keeps tickets valid.
 */
export function EventLifecycle({
  date,
  endTime,
  listingId,
  startTime,
  title,
}: {
  date: string;
  endTime: string;
  listingId: string;
  startTime: string;
  title: string;
}) {
  const router = useRouter();
  const { error, pending, perform } = useMemberAction();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState({ date, startTime, endTime });
  const [notice, setNotice] = useState<string | null>(null);

  async function postpone() {
    const result = await perform(() =>
      postponeEvent(listingId, draftStartsAt(when), draftEndsAt(when))
    );
    if (result.ok) {
      setNotice("Event moved. Ticket holders and followers are being told.");
      router.refresh();
    }
  }

  async function cancel() {
    const result = await perform(() => cancelEvent(listingId));
    setOpen(false);
    if (result.ok) {
      setNotice(
        `Event cancelled. ${result.data.ticketsCancelled} tickets cancelled.`
      );
      router.refresh();
    }
  }

  return (
    <section
      aria-labelledby="lifecycle-heading"
      className="space-y-4 rounded-2xl border border-border bg-card p-4"
    >
      <h2
        className="font-display font-semibold text-heading-sm"
        id="lifecycle-heading"
      >
        Postpone or cancel
      </h2>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await postpone();
        }}
      >
        <Field className="w-44">
          <FieldLabel htmlFor="postpone-date">New date</FieldLabel>
          <Input
            id="postpone-date"
            onChange={(e) => setWhen({ ...when, date: e.target.value })}
            required
            type="date"
            value={when.date}
          />
        </Field>
        <Field className="w-32">
          <FieldLabel htmlFor="postpone-start">Starts</FieldLabel>
          <Input
            id="postpone-start"
            onChange={(e) => setWhen({ ...when, startTime: e.target.value })}
            required
            type="time"
            value={when.startTime}
          />
        </Field>
        <Field className="w-32">
          <FieldLabel htmlFor="postpone-end">Ends</FieldLabel>
          <Input
            id="postpone-end"
            onChange={(e) => setWhen({ ...when, endTime: e.target.value })}
            required
            type="time"
            value={when.endTime}
          />
        </Field>
        <Button disabled={pending} type="submit" variant="outline">
          Postpone
        </Button>
      </form>
      <div className="border-t pt-3">
        <Button
          disabled={pending}
          onClick={() => setOpen(true)}
          variant="destructive"
        >
          Cancel event
        </Button>
      </div>
      {notice ? (
        <p className="text-body text-primary" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancel {title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every valid ticket is cancelled and the people who are going, saved
            it or hold tickets are told. This can't be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep event</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>Cancel event</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
