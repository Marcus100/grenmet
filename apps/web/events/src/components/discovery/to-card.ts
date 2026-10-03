import type { Profile, PublicEvent } from "@/domain/types";
import type { EventCardData } from "./event-card";

/** Resolves going ids to names for the card's avatar stack. */
export function toCardData(
  event: PublicEvent,
  profiles: readonly Profile[]
): EventCardData {
  const goingNames = event.goingIds
    .map((id) => profiles.find((profile) => profile.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return { ...event, goingNames, goingTotal: event.goingIds.length };
}
