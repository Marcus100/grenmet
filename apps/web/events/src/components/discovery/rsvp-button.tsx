"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { setGoing } from "@/data/actions";
import type { Admission } from "@/domain/types";

const IDLE_LABEL: Record<Exclude<Admission, "ticketed">, string> = {
  free: "I'm going",
  rsvp: "RSVP — it's free",
};

/** RSVP for free events. Ticketed events use `TicketClaim`. */
export function RsvpButton({
  admission,
  initiallyGoing,
  slug,
}: {
  admission: Exclude<Admission, "ticketed">;
  initiallyGoing: boolean;
  slug: string;
}) {
  const [going, setGoingState] = useState(initiallyGoing);
  const { error, pending, perform } = useMemberAction();

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
        className="text-body-base h-11 w-full"
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
