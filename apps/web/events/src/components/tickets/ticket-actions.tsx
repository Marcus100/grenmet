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
import { Printer, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { cancelTicket } from "@/data/actions";

/** Cancels one unused ticket before the event; the seat goes back on sale. */
export function CancelTicketButton({
  ticketId,
  title,
}: {
  ticketId: string;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { error, pending, perform } = useMemberAction();

  async function cancel() {
    const result = await perform(() => cancelTicket(ticketId));
    setOpen(false);
    if (result.ok) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={() => setOpen(true)} variant="outline">
        <X data-icon="inline-start" />
        Cancel ticket
      </Button>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancel this ticket?</AlertDialogTitle>
          <AlertDialogDescription>
            Your ticket for {title} stops working and the place goes back on
            sale. You can claim another if any are left.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep ticket</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={cancel}>
              Cancel ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} variant="outline">
      <Printer data-icon="inline-start" />
      Print
    </Button>
  );
}
