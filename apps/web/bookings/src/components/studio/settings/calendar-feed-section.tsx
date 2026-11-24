"use client";

// Settings > Calendar: the business's private calendar feed. An owner or admin
// makes the link once, adds it to a phone, and every booking then appears in
// that calendar on its own. The address is shown only in the response to making
// or resetting the link (the API keeps just a hash), so the section says so and
// offers a reset with a confirmation. Members see a plain note instead.

import type { BookingCalendarFeedStatus } from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState, useEffect, useState } from "react";
import {
  createCalendarFeedAction,
  rotateCalendarFeedAction,
} from "@/app/studio/[orgSlug]/settings/actions";
import {
  CALENDAR_FEED_IDLE,
  type CalendarFeedState,
  webcalUrl,
} from "@/lib/calendar-feed";
import { SettingsResult } from "./settings-ui";

const SECTION =
  "scroll-mt-6 space-y-4 rounded-lg border border-border p-4 md:p-6";
const TARGET = "min-h-11";

export function CalendarFeedSection({
  editable,
  orgSlug,
  status,
}: {
  editable: boolean;
  orgSlug: string;
  /** Null when the status could not be loaded. Members never load it. */
  status: BookingCalendarFeedStatus | null;
}) {
  const [made, makeAction, making] = useActionState(
    createCalendarFeedAction.bind(null, orgSlug),
    CALENDAR_FEED_IDLE
  );
  const [reset, resetAction, resetting] = useActionState(
    rotateCalendarFeedAction.bind(null, orgSlug),
    CALENDAR_FEED_IDLE
  );

  const address = addressFrom(made, reset);
  const result = reset.status === "idle" ? made : reset;
  const linked = status?.enabled === true || address !== null;

  return (
    <section
      aria-labelledby="calendar-heading"
      className={SECTION}
      id="calendar"
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold" id="calendar-heading">
          Calendar
        </h2>
        <p className="text-muted-foreground text-sm">
          Put every booking in your phone&apos;s calendar, and keep it up to
          date on its own. Customers appear by first name only.
        </p>
      </header>

      {editable ? null : (
        <p className="text-muted-foreground text-sm">
          Only an owner or admin can make or reset the calendar link.
        </p>
      )}

      {editable && status === null ? (
        <p className="text-muted-foreground text-sm" role="status">
          The calendar link could not be loaded. Reload the page to try again.
        </p>
      ) : null}

      {editable && status !== null && !linked ? (
        <form action={makeAction} className="space-y-2">
          <p className="text-sm">
            No calendar link yet. Make one, then add it to your phone.
          </p>
          <Button className={TARGET} disabled={making} type="submit">
            {making ? "Making link…" : "Make calendar link"}
          </Button>
        </form>
      ) : null}

      {editable && address !== null ? <AddressBlock url={address} /> : null}

      {editable && linked ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            The address is shown only once, when the link is made or reset. To
            get it again, reset the link. The old address stops working.
          </p>
          <ResetDialog
            action={resetAction}
            pending={resetting}
            result={reset}
          />
        </div>
      ) : null}

      {editable && result.status !== "idle" ? (
        <SettingsResult pending={making || resetting} state={result} />
      ) : null}

      <Instructions />
    </section>
  );
}

/** The address to show: a reset's replaces the one made earlier in this visit. */
function addressFrom(
  made: CalendarFeedState,
  reset: CalendarFeedState
): string | null {
  if (reset.status === "success" && reset.url) {
    return reset.url;
  }
  if (made.status === "success" && made.url) {
    return made.url;
  }
  return null;
}

function AddressBlock({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-border bg-muted/40 space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">
        Copy this address now. It is not shown again.
      </p>
      <Button
        className={TARGET}
        render={<a href={webcalUrl(url)} />}
        variant="default"
      >
        Add to my phone calendar
      </Button>
      <div className="space-y-2">
        <Label htmlFor="calendar-feed-address">Calendar address</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="h-11 font-mono text-sm"
            id="calendar-feed-address"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={url}
          />
          <Button
            className={TARGET}
            onClick={copy}
            type="button"
            variant="outline"
          >
            {copied ? "Copied" : "Copy address"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResetDialog({
  action,
  pending,
  result,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  /** The reset's latest state; a new success closes the dialog. */
  result: CalendarFeedState;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (result.status === "success") {
      setOpen(false);
    }
  }, [result]);
  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={<Button className={TARGET} variant="outline" />}
      >
        Reset link
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the calendar link?</AlertDialogTitle>
          <AlertDialogDescription>
            The current address stops working at once. Every phone that added it
            stops updating until its owner adds the new address, which is shown
            only once.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={TARGET}>
            Keep this link
          </AlertDialogCancel>
          <form action={action}>
            <Button className={TARGET} disabled={pending} type="submit">
              {pending ? "Resetting…" : "Reset link"}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Instructions() {
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <h3 className="font-medium">iPhone</h3>
        <p className="text-muted-foreground">
          Tap &ldquo;Add to my phone calendar&rdquo; above and choose Subscribe.
          Or open Settings, Calendar, Accounts, Add Account, Other, Add
          Subscribed Calendar, and paste the address. Tap Done.
        </p>
      </div>
      <div className="space-y-1">
        <h3 className="font-medium">Google Calendar</h3>
        <p className="text-muted-foreground">
          On a computer, open calendar.google.com, choose the plus beside Other
          calendars, then From URL, and paste the address. Google updates
          subscribed calendars on its own schedule, which can take a day. The
          Google Calendar phone app cannot add an address.
        </p>
      </div>
    </div>
  );
}
