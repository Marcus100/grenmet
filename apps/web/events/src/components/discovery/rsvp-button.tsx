"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Check, Ticket } from "lucide-react";
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { setGoing } from "@/data/actions";
import type { Admission } from "@/domain/types";

const IDLE_LABEL: Record<Exclude<Admission, "ticketed">, string> = {
  free: "I'm going",
  rsvp: "RSVP — it's free",
};

/** RSVP for free events. Ticketed events get checkout with the payments step. */
export function RsvpButton({
  admission,
  initiallyGoing,
  slug,
}: {
  admission: Admission;
  initiallyGoing: boolean;
  slug: string;
}) {
  const [going, setGoingState] = useState(initiallyGoing);
  const { error, pending, perform } = useMemberAction();

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

  async function toggle() {
    const next = !going;
    const result = await perform(() => setGoing(slug, next));
    if (result.ok) {
      setGoingState(next);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        aria-pressed={going}
        className="h-11 w-full text-body-base"
        disabled={pending}
        onClick={toggle}
        size="lg"
        variant={going ? "outline" : "default"}
      >
        {going ? <Check data-icon="inline-start" /> : null}
        {going ? "You're going" : IDLE_LABEL[admission]}
      </Button>
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
