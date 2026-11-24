"use client";

import type { BookingPublicAddOn } from "@barrelsgd/api-client";
import { useRef, useState } from "react";
import { addOnsFor, toggleAddOn } from "../lib/add-ons";

const TIME_NOTE =
  "That time no longer fits with your add-ons. Please pick another time.";

/**
 * The add-on choice on the booking form: which ids are ticked, when the times
 * must be asked for again, and the plain note when a chosen time was cleared
 * because the visit got longer. The flow owns the chosen time itself.
 */
export function useAddOns({
  addOns,
  serviceId,
  startsAt,
}: {
  addOns: readonly BookingPublicAddOn[] | undefined;
  serviceId: string | null;
  startsAt: string | null;
}) {
  const [ids, setIds] = useState<string[]>([]);
  // Set once the API says add-ons are off (422): the step stays hidden.
  const [off, setOff] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  // True between ticking an add-on and the new times arriving, so a cleared
  // time can say why.
  const changedTime = useRef(false);
  const offered = off ? [] : addOnsFor(addOns, serviceId);

  return {
    ids,
    note,
    offered,
    /** Added to the flow's reload key: any change asks for the times again. */
    reloads,
    choose(id: string) {
      const next = toggleAddOn(ids, id, offered);
      if (next.length === ids.length && next.every((x) => ids.includes(x))) {
        return;
      }
      setIds(next);
      setReloads((n) => n + 1);
      setNote(null);
      changedTime.current = startsAt !== null;
    },
    /** A time was picked: nothing to explain any more. */
    clearNote() {
      setNote(null);
      changedTime.current = false;
    },
    /** Another service was chosen: its add-ons start unticked. */
    reset() {
      setIds([]);
      setNote(null);
      changedTime.current = false;
    },
    /** The chosen time is gone from the fresh list. */
    timeNoLongerFits() {
      if (changedTime.current) {
        changedTime.current = false;
        setNote(TIME_NOTE);
      }
    },
    /** The API refused add-ons: drop them all, say why, load the plain times. */
    gone(message: string) {
      setOff(true);
      setIds([]);
      setReloads((n) => n + 1);
      setNote(message);
      changedTime.current = false;
    },
  };
}
