import "server-only";

import {
  eventsGetGroup,
  eventsGetListing,
  eventsGetManagedOrganiser,
  eventsGetMyNetwork,
  eventsGetMyPlans,
  eventsGetOrganiser,
  eventsGetPerson,
  eventsGetThread,
  eventsListGroups,
  eventsListListings,
  eventsListThreads,
  ResponseError,
} from "@barrelsgd/api-client";
import type {
  EventDetail,
  EventFilters,
  Group,
  GroupDetail,
  ManagedEvent,
  Network,
  Organiser,
  PersonProfile,
  Plans,
  PublicEvent,
  ThreadDetail,
  ThreadSummary,
} from "@/domain/types";
import { apiOptions } from "@/lib/api";
import { getSession } from "@/lib/session";
import {
  toEvent,
  toEventDetail,
  toGroup,
  toGroupDetail,
  toManagedEvent,
  toNetwork,
  toOrganiser,
  toPersonProfile,
  toPlans,
  toThread,
  toThreadSummary,
} from "./api-mappers";

/**
 * Server-side reads from the Events API. Each call carries the signed-in
 * member's token when there is one, so the API personalises "going", "saved"
 * and "following" itself. A 404 becomes `null`; any other failure throws to
 * the app's error boundary (and Sentry).
 */

async function options() {
  const session = await getSession();
  return apiOptions(session?.accessToken);
}

async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export interface ListEventsOptions {
  /** Include events that have already ended (organiser and archive views). */
  readonly includePast?: boolean;
  readonly organiserSlug?: string;
}

/** Published public events, soonest first. Filtering happens in SQL. */
export async function listEvents(
  filters: EventFilters = {},
  { includePast = false, organiserSlug }: ListEventsOptions = {}
): Promise<PublicEvent[]> {
  const result = await eventsListListings({
    ...(await options()),
    query: {
      ...(filters.when ? { when: filters.when } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.parish ? { parish: filters.parish } : {}),
      ...(filters.price ? { price: filters.price } : {}),
      ...(filters.tag ? { tag: filters.tag } : {}),
      ...(filters.query ? { q: filters.query } : {}),
      ...(organiserSlug ? { organiser: organiserSlug } : {}),
      ...(includePast ? { include_past: true } : {}),
      limit: 200,
    },
  }).unwrap();
  return result.data.map(toEvent);
}

export async function getEventBySlug(
  slug: string
): Promise<EventDetail | null> {
  const listing = await orNull(
    eventsGetListing({ ...(await options()), path: { slug } }).unwrap()
  );
  return listing ? toEventDetail(listing) : null;
}

export async function getOrganiserBySlug(
  slug: string
): Promise<Organiser | null> {
  const organiser = await orNull(
    eventsGetOrganiser({ ...(await options()), path: { slug } }).unwrap()
  );
  return organiser ? toOrganiser(organiser) : null;
}

export async function listGroups(): Promise<Group[]> {
  const result = await eventsListGroups(await options()).unwrap();
  return result.map(toGroup);
}

export async function getGroupBySlug(
  slug: string
): Promise<GroupDetail | null> {
  const group = await orNull(
    eventsGetGroup({ ...(await options()), path: { slug } }).unwrap()
  );
  return group ? toGroupDetail(group) : null;
}

export async function getPersonByHandle(
  handle: string
): Promise<PersonProfile | null> {
  const person = await orNull(
    eventsGetPerson({ ...(await options()), path: { handle } }).unwrap()
  );
  return person ? toPersonProfile(person) : null;
}

/** The signed-in member's going, saved, groups and followed organisers. */
export async function getMyPlans(): Promise<Plans> {
  return toPlans(await eventsGetMyPlans(await options()).unwrap());
}

export async function getMyNetwork(): Promise<Network> {
  return toNetwork(await eventsGetMyNetwork(await options()).unwrap());
}

export async function listThreads(): Promise<ThreadSummary[]> {
  const result = await eventsListThreads(await options()).unwrap();
  return result.map(toThreadSummary);
}

export async function getThread(id: string): Promise<ThreadDetail | null> {
  const thread = await orNull(
    eventsGetThread({ ...(await options()), path: { thread_id: id } }).unwrap()
  );
  return thread ? toThread(thread) : null;
}

/** The organiser's own listings, drafts included. Null without organiser access. */
export async function getManagedOrganiser(): Promise<{
  organiser: Organiser;
  listings: ManagedEvent[];
} | null> {
  try {
    const managed = await eventsGetManagedOrganiser(await options()).unwrap();
    return {
      organiser: toOrganiser(managed),
      listings: managed.listings.map(toManagedEvent),
    };
  } catch (error) {
    if (error instanceof ResponseError && error.status === 403) {
      return null;
    }
    throw error;
  }
}
