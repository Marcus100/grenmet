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
import { cancelEventWithRefund } from "@/data/order-actions";
import {
  type CancelCounts,
  EVENT_CANCEL_BUTTON,
  EVENT_REFUND_CHOICES,
  type RefundChoice,
} from "@/lib/org-orders";
import { draftEndsAt, draftStartsAt } from "./event-draft";
import { RefundChoiceGroup } from "./refund-choice";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What a finished event cancel did, as separate lines so none is hidden. */
export function CancelSummary({ counts }: { counts: CancelCounts }) {
  return (
    <div className="space-y-1" role="status">
      <p className="font-medium text-body text-primary">Event cancelled.</p>
      <ul className="list-disc pl-5 text-body">
        <li>
          {plural(counts.ticketsCancelled, "ticket", "tickets")} cancelled
        </li>
        <li>
          {plural(counts.ordersQueued, "order", "orders")} queued for a card
          refund
        </li>
        <li>{plural(counts.ordersRefunded, "order", "orders")} refunded now</li>
        <li>
          {plural(counts.ordersReleased, "unpaid order", "unpaid orders")}{" "}
          released
        </li>
        <li>{plural(counts.ordersKept, "order", "orders")} kept the money</li>
        <li className={counts.refundsFailed > 0 ? "text-destructive" : ""}>
          {plural(counts.refundsFailed, "refund", "refunds")} failed
          {counts.refundsFailed > 0
            ? "; refund those by hand from the Orders screen"
            : ""}
        </li>
      </ul>
    </div>
  );
}

/**
 * Cancel or postpone a published event. Cancelling cancels every valid ticket
 * and tells going, saved and ticket-holding members; outlet cash tickets can
 * then be refunded from the outlet screen. Postponing keeps tickets valid.
 */
export function EventLifecycle({
  canChooseRefund = false,
  date,
  endTime,
  listingId,
  startTime,
  title,
}: {
  /** True when the organiser has an organisation, so cancelling can refund. */
  canChooseRefund?: boolean;
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
  const [refund, setRefund] = useState<RefundChoice>("follow_policy");
  const [counts, setCounts] = useState<CancelCounts | null>(null);

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
    if (canChooseRefund) {
      const result = await perform(() =>
        cancelEventWithRefund(listingId, refund)
      );
      setOpen(false);
      if (result.ok) {
        setCounts(result.data);
        router.refresh();
      }
      return;
    }
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
          className="min-h-11"
          disabled={pending}
          onClick={() => setOpen(true)}
          variant="destructive"
        >
          Cancel event
        </Button>
      </div>
      {counts ? <CancelSummary counts={counts} /> : null}
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
          {canChooseRefund ? (
            <RefundChoiceGroup
              legend="Money already paid online"
              name="cancel-event-refund"
              onChange={setRefund}
              options={EVENT_REFUND_CHOICES}
              value={refund}
            />
          ) : (
            <p className="rounded-xl border border-destructive/40 p-3 font-medium text-body">
              This cancel moves no money. Orders and refunds aren't available
              for this organiser until a Barrels admin links it to an
              organisation.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep event</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>
              {canChooseRefund ? EVENT_CANCEL_BUTTON[refund] : "Cancel event"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
