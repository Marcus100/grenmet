"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Check, Ticket } from "lucide-react";
import { useState } from "react";
import type { Admission } from "@/domain/types";

const IDLE_LABEL: Record<Exclude<Admission, "ticketed">, string> = {
  free: "I'm going",
  rsvp: "RSVP — it's free",
};

/**
 * Demo RSVP. Holds state locally until the attendee API exists; the label
 * says so, so nobody mistakes it for a confirmed booking.
 */
export function RsvpButton({
  admission,
  initiallyGoing,
}: {
  admission: Admission;
  initiallyGoing: boolean;
}) {
  const [going, setGoing] = useState(initiallyGoing);

  if (admission === "ticketed") {
    return (
      <Button
        className="h-11 w-full text-body-base"
        disabled
        size="lg"
        title="Ticket checkout arrives with the payments step"
      >
        <Ticket data-icon="inline-start" />
        Get tickets
      </Button>
    );
  }

  return (
    <Button
      aria-pressed={going}
      className="h-11 w-full text-body-base"
      onClick={() => setGoing((value) => !value)}
      size="lg"
      variant={going ? "outline" : "default"}
    >
      {going ? <Check data-icon="inline-start" /> : null}
      {going ? "You're going" : IDLE_LABEL[admission]}
    </Button>
  );
}
