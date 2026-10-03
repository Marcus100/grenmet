import { isCategory, isParish } from "@/domain/labels";
import type {
  Connection,
  EventFilters,
  Group,
  MessageThread,
  Organiser,
  Profile,
  PublicEvent,
} from "@/domain/types";
import { addDaysToKey, grenadaDateKey, grenadaWeekday } from "@/lib/datetime";
import {
  buildDemoEvents,
  DEMO_VIEWER_ID,
  demoConnections,
  demoGroups,
  demoOrganisers,
  demoProfiles,
  demoThreads,
} from "./community-fixtures";

/**
 * Data access for public discovery and community features.
 *
 * Async so a FastAPI-backed source can replace the fixtures without touching
 * call sites. Pure helpers are exported for tests and reuse.
 */

export { DEMO_VIEWER_ID } from "./community-fixtures";

const FRIDAY = 5;
const SUNDAY = 0;

/** True when the event is on today's Grenada date and has not ended. */
export function isTonight(event: PublicEvent, now: Date): boolean {
  return (
    grenadaDateKey(event.startsAt) === grenadaDateKey(now) &&
    new Date(event.endsAt) > now
  );
}

/**
 * The Friday–Sunday window this weekend, as Grenada date keys. On a weekend
 * day it starts today; Monday–Thursday it is the coming weekend.
 */
export function weekendWindow(now: Date): { end: string; start: string } {
  const today = grenadaDateKey(now);
  const weekday = grenadaWeekday(now);

  if (weekday === SUNDAY) {
    return { start: today, end: today };
  }
  if (weekday >= FRIDAY) {
    return { start: today, end: addDaysToKey(today, 7 - weekday) };
  }
  const start = addDaysToKey(today, FRIDAY - weekday);
  return { start, end: addDaysToKey(start, 2) };
}

export function isThisWeekend(event: PublicEvent, now: Date): boolean {
  const { start, end } = weekendWindow(now);
  const key = grenadaDateKey(event.startsAt);
  return key >= start && key <= end && new Date(event.endsAt) > now;
}

function withinDays(event: PublicEvent, now: Date, days: number): boolean {
  const key = grenadaDateKey(event.startsAt);
  return key < addDaysToKey(grenadaDateKey(now), days);
}

/** Upcoming events matching every filter, soonest first. */
export function filterEvents(
  events: readonly PublicEvent[],
  filters: EventFilters,
  now: Date
): PublicEvent[] {
  const query = filters.query?.trim().toLowerCase();

  return events
    .filter((event) => new Date(event.endsAt) > now)
    .filter((event) => !filters.category || event.category === filters.category)
    .filter((event) => !filters.parish || event.parish === filters.parish)
    .filter((event) => !filters.tag || event.tags.includes(filters.tag))
    .filter((event) => {
      if (filters.price === "free") {
        return event.admission !== "ticketed";
      }
      if (filters.price === "paid") {
        return event.admission === "ticketed";
      }
      return true;
    })
    .filter((event) => {
      switch (filters.when) {
        case "tonight":
          return isTonight(event, now);
        case "weekend":
          return isThisWeekend(event, now);
        case "week":
          return withinDays(event, now, 7);
        case "month":
          return withinDays(event, now, 31);
        default:
          return true;
      }
    })
    .filter(
      (event) =>
        !query ||
        `${event.title} ${event.summary} ${event.venue}`
          .toLowerCase()
          .includes(query)
    )
    .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export interface DayGroup {
  readonly events: readonly PublicEvent[];
  readonly key: string;
}

/** Groups sorted events by their Grenada calendar date. */
export function groupByDay(events: readonly PublicEvent[]): DayGroup[] {
  const groups = new Map<string, PublicEvent[]>();
  for (const event of events) {
    const key = grenadaDateKey(event.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.entries()].map(([key, dayEvents]) => ({
    key,
    events: dayEvents,
  }));
}

/** Reads untrusted search params into typed filters, dropping unknown values. */
export function parseFilters(
  params: Record<string, string | string[] | undefined>
): EventFilters {
  const one = (name: string): string | undefined => {
    const value = params[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const when = one("when");
  const price = one("price");
  const category = one("category");
  const parish = one("parish");
  const query = one("q");

  return {
    ...(isCategory(category) ? { category } : {}),
    ...(isParish(parish) ? { parish } : {}),
    ...(price === "free" || price === "paid" ? { price } : {}),
    ...(when === "tonight" ||
    when === "weekend" ||
    when === "week" ||
    when === "month"
      ? { when }
      : {}),
    ...(query ? { query: query.slice(0, 100) } : {}),
  };
}

export type ConnectionState =
  | "self"
  | "none"
  | "connected"
  | "sent"
  | "received";

export function connectionState(
  viewerId: string,
  otherId: string,
  connections: readonly Connection[]
): ConnectionState {
  if (viewerId === otherId) {
    return "self";
  }
  const link = connections.find(
    (connection) =>
      connection.profileIds.includes(viewerId) &&
      connection.profileIds.includes(otherId)
  );
  if (!link) {
    return "none";
  }
  if (link.status === "accepted") {
    return "connected";
  }
  return link.requestedBy === viewerId ? "sent" : "received";
}

/**
 * Safety rule: direct messages only between accepted connections or members
 * of a shared group. The backend must enforce the same rule.
 */
export function canMessage(
  viewer: Profile,
  other: Profile,
  connections: readonly Connection[]
): boolean {
  if (viewer.id === other.id) {
    return false;
  }
  if (connectionState(viewer.id, other.id, connections) === "connected") {
    return true;
  }
  return viewer.groupIds.some((groupId) => other.groupIds.includes(groupId));
}

function overlap<T>(a: readonly T[], b: readonly T[]): number {
  return a.filter((item) => b.includes(item)).length;
}

/** People going to an event, most in common with the viewer first. */
export function peopleYouMightMeet(
  event: PublicEvent,
  viewer: Profile,
  profiles: readonly Profile[]
): Profile[] {
  const score = (profile: Profile) =>
    overlap(profile.interests, viewer.interests) +
    2 * overlap(profile.groupIds, viewer.groupIds);

  return profiles
    .filter(
      (profile) =>
        profile.id !== viewer.id && event.goingIds.includes(profile.id)
    )
    .toSorted((a, b) => score(b) - score(a));
}

/** Groups the viewer has not joined, matching their interests first. */
export function suggestGroups(
  viewer: Profile,
  groups: readonly Group[]
): Group[] {
  return groups
    .filter((group) => !viewer.groupIds.includes(group.id))
    .toSorted(
      (a, b) =>
        Number(viewer.interests.includes(b.category)) -
        Number(viewer.interests.includes(a.category))
    );
}

export function groupMembers(
  group: Group,
  profiles: readonly Profile[]
): Profile[] {
  return profiles.filter((profile) => profile.groupIds.includes(group.id));
}

// ---------------------------------------------------------------------------
// Async accessors. Each takes an optional `now` so tests are deterministic.
// ---------------------------------------------------------------------------

export async function listEvents(
  filters: EventFilters = {},
  now: Date = new Date()
): Promise<PublicEvent[]> {
  return await Promise.resolve(
    filterEvents(buildDemoEvents(now), filters, now)
  );
}

export async function getEventBySlug(
  slug: string,
  now: Date = new Date()
): Promise<PublicEvent | null> {
  return await Promise.resolve(
    buildDemoEvents(now).find((event) => event.slug === slug) ?? null
  );
}

export async function getOrganiserBySlug(
  slug: string
): Promise<Organiser | null> {
  return await Promise.resolve(
    demoOrganisers.find((organiser) => organiser.slug === slug) ?? null
  );
}

export async function getOrganiser(id: string): Promise<Organiser | null> {
  return await Promise.resolve(
    demoOrganisers.find((organiser) => organiser.id === id) ?? null
  );
}

export async function listGroups(): Promise<readonly Group[]> {
  return await Promise.resolve(demoGroups);
}

export async function getGroupBySlug(slug: string): Promise<Group | null> {
  return await Promise.resolve(
    demoGroups.find((group) => group.slug === slug) ?? null
  );
}

export async function getGroupById(id: string): Promise<Group | null> {
  return await Promise.resolve(
    demoGroups.find((group) => group.id === id) ?? null
  );
}

export async function listProfiles(): Promise<readonly Profile[]> {
  return await Promise.resolve(demoProfiles);
}

export async function getProfileByHandle(
  handle: string
): Promise<Profile | null> {
  return await Promise.resolve(
    demoProfiles.find((profile) => profile.handle === handle) ?? null
  );
}

/** The demo signed-in member. Replaced by the session once auth is wired. */
export async function getViewer(): Promise<Profile> {
  const viewer = demoProfiles.find((profile) => profile.id === DEMO_VIEWER_ID);
  if (!viewer) {
    throw new Error("Demo viewer profile is missing from fixtures.");
  }
  return await Promise.resolve(viewer);
}

export async function listConnections(): Promise<readonly Connection[]> {
  return await Promise.resolve(demoConnections);
}

export async function listThreads(
  viewerId: string
): Promise<readonly MessageThread[]> {
  return await Promise.resolve(
    demoThreads.filter((thread) => thread.participantIds.includes(viewerId))
  );
}

export async function getThread(
  id: string,
  viewerId: string
): Promise<MessageThread | null> {
  const thread = demoThreads.find((candidate) => candidate.id === id);
  return await Promise.resolve(
    thread?.participantIds.includes(viewerId) ? thread : null
  );
}

export async function getEventById(
  id: string,
  now: Date = new Date()
): Promise<PublicEvent | null> {
  return await Promise.resolve(
    buildDemoEvents(now).find((event) => event.id === id) ?? null
  );
}

/** Every listing an organiser owns, past and upcoming, soonest first. */
export async function listOrganiserEvents(
  organiserId: string,
  now: Date = new Date()
): Promise<PublicEvent[]> {
  return await Promise.resolve(
    buildDemoEvents(now)
      .filter((event) => event.organiserId === organiserId)
      .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
  );
}
