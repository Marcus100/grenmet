import type {
  BookingListingQueue,
  BookingListingReview,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import Link from "next/link";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import {
  LISTING_EMPTY,
  LISTING_QUEUE_LABEL,
  LISTING_QUEUES,
  listingNoticeFor,
} from "@/lib/bookings-listing-form";

type ListingFormAction = (formData: FormData) => Promise<void>;

const TRAILING_SLASH = /\/$/u;

export function stamp(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** A written notice after an approve or withdraw; the code comes from the URL. */
export function ListingNotice({ code }: { code: string | undefined }) {
  const notice = listingNoticeFor(code);
  if (!notice) return null;
  return (
    <p
      className={`rounded-md border px-3 py-2 text-sm ${
        notice.tone === "problem" ? "border-destructive" : ""
      }`}
      role={notice.tone === "problem" ? "alert" : "status"}
    >
      {notice.tone === "problem" ? "Problem: " : ""}
      {notice.text}
    </p>
  );
}

export function QueueTabs({ current }: { current: BookingListingQueue }) {
  return (
    <nav aria-label="Listing queue" className="flex flex-wrap gap-2">
      {LISTING_QUEUES.map((queue) => (
        <Link
          aria-current={queue === current ? "page" : undefined}
          className={`hover:bg-muted inline-flex min-h-9 items-center rounded-md border px-4 text-sm pointer-coarse:min-h-11 ${
            queue === current ? "bg-muted font-medium" : ""
          }`}
          href={`/bookings/listings?queue=${queue}`}
          key={queue}
        >
          {LISTING_QUEUE_LABEL[queue]}
        </Link>
      ))}
    </nav>
  );
}

/** Written state for one business: approved, waiting, or not asked for the list. */
export function listingState(row: BookingListingReview): {
  detail: string;
  label: string;
  variant: "light-success" | "light-warning" | "light-light";
} {
  if (row.listing_approved_at) {
    return {
      label: "Approved",
      variant: "light-success",
      detail: `Approved ${stamp(row.listing_approved_at)}`,
    };
  }
  if (row.listed) {
    return {
      label: "Waiting",
      variant: "light-warning",
      detail: "Asked to appear on the home page. Needs approval.",
    };
  }
  return {
    label: "Not requested",
    variant: "light-light",
    detail: "Not asked to appear on the home page.",
  };
}

/** Flags staff review, written out; empty when there are none. */
export function listingFlags(row: BookingListingReview): string[] {
  const flags: string[] = [];
  if (row.self_created) flags.push("Self-created");
  if (row.owner_left_at) flags.push("Owner left");
  if (row.sender_name_flagged_at) flags.push("Sender name flagged");
  return flags;
}

export function ListingList({
  approve,
  publicOrigin,
  queue,
  rows,
  withdraw,
}: {
  approve: ListingFormAction;
  publicOrigin: string;
  queue: BookingListingQueue;
  rows: BookingListingReview[];
  withdraw: ListingFormAction;
}) {
  if (rows.length === 0) {
    return (
      <Empty role="status">
        <EmptyHeader>
          <EmptyTitle>{LISTING_EMPTY[queue].title}</EmptyTitle>
          <EmptyDescription>{LISTING_EMPTY[queue].text}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul aria-label="Businesses" className="grid gap-3">
      {rows.map((row) => (
        <ListingRow
          approve={approve}
          key={row.organisation_id}
          publicOrigin={publicOrigin}
          queue={queue}
          row={row}
          withdraw={withdraw}
        />
      ))}
    </ul>
  );
}

function ListingRow({
  approve,
  publicOrigin,
  queue,
  row,
  withdraw,
}: {
  approve: ListingFormAction;
  publicOrigin: string;
  queue: BookingListingQueue;
  row: BookingListingReview;
  withdraw: ListingFormAction;
}) {
  const state = listingState(row);
  const flags = listingFlags(row);
  const publicHref = `${publicOrigin.replace(TRAILING_SLASH, "")}/${encodeURIComponent(row.public_slug)}`;
  const fields = { organisation_id: row.organisation_id, queue };
  const approved = Boolean(row.listing_approved_at);

  return (
    <li className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="grid min-w-0 gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{row.display_name}</p>
          <p className="text-muted-foreground font-mono text-xs break-all">
            {row.public_slug}
          </p>
          <a
            className="inline-flex items-center text-sm underline-offset-4 hover:underline pointer-coarse:min-h-11"
            href={publicHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            Public booking page
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={state.variant}>{state.label}</Badge>
          <span className="text-muted-foreground">{state.detail}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {flags.length === 0 ? (
            <span className="text-muted-foreground text-sm">No flags</span>
          ) : (
            flags.map((flag) => (
              <Badge key={flag} variant="light-error">
                {flag}
              </Badge>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {approved ? (
          <ConfirmActionDialog
            action={withdraw}
            className="pointer-coarse:min-h-11"
            confirmLabel="Withdraw from home page"
            description={`${row.display_name} comes off the Bookings home page at once. Its booking page still works by its link. The change is recorded under your name.`}
            fields={fields}
            title={`Withdraw ${row.display_name}?`}
            triggerLabel="Withdraw"
          />
        ) : null}
        {!approved && row.listed ? (
          <ConfirmActionDialog
            action={approve}
            className="pointer-coarse:min-h-11"
            confirmLabel="Approve listing"
            description={`${row.display_name} appears on the Bookings home page. Its booking page works by its link either way. The approval is recorded under your name.`}
            destructive={false}
            fields={fields}
            title={`Approve ${row.display_name}?`}
            triggerLabel="Approve"
          />
        ) : null}
      </div>
    </li>
  );
}

export function AccessDenied() {
  return (
    <section
      aria-labelledby="listing-denied-heading"
      className="grid gap-2 rounded-md border p-4"
      role="alert"
    >
      <h2 className="font-medium" id="listing-denied-heading">
        You don't have access
      </h2>
      <p className="text-muted-foreground text-sm">
        Your account can't review Bookings home page listings. Approving and
        withdrawing need the listing permission.
      </p>
    </section>
  );
}
