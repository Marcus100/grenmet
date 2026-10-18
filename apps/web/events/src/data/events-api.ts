import "server-only";

import {
  eventsGetGroup,
  eventsGetListing,
  eventsGetListingActivity,
  eventsGetManagedOrganiser,
  eventsGetMyNetwork,
  eventsGetMyPlans,
  eventsGetMyTicket,
  eventsGetOrganiser,
  eventsGetPerson,
  eventsGetThread,
  eventsListGroups,
  eventsListListings,
  eventsListMyTickets,
  eventsListThreads,
  ResponseError,
} from "@barrelsgd/api-client";
import type {
  ActivityEntry,
  EventDetail,
  EventFilters,
  Group,
  GroupDetail,
  ManagedEvent,
  MyTicket,
  MyTicketDetail,
  Network,
  Organiser,
  OrganiserOption,
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
  toMyTicket,
  toMyTicketDetail,
  toNetwork,
  toOrganiser,
  toPersonProfile,
  toPlans,
  toThread,
  toThreadSummary,
} from "./api-mappers";
import { chosenOrganiser } from "./organiser-choice";

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

export interface ManagedWorkspace {
  listings: ManagedEvent[];
  organiser: Organiser;
  organisers: OrganiserOption[];
}

/**
 * The organiser's own listings, drafts included, for the organiser picked in
 * the switcher (cookie) or the first one. Null without organiser access.
 */
export async function getManagedOrganiser(): Promise<ManagedWorkspace | null> {
  const chosen = await chosenOrganiser();
  const load = async (organiser: string | undefined) =>
    await eventsGetManagedOrganiser({
      ...(await options()),
      ...(organiser ? { query: { organiser } } : {}),
    }).unwrap();
  try {
    let managed: Awaited<ReturnType<typeof load>>;
    try {
      managed = await load(chosen);
    } catch (error) {
      // A remembered organiser the member no longer manages: fall back.
      if (chosen && error instanceof ResponseError && error.status === 403) {
        managed = await load(undefined);
      } else {
        throw error;
      }
    }
    return {
      organiser: toOrganiser(managed),
      organisers: managed.organisers.map((row) => ({
        slug: row.slug,
        name: row.name,
        organisationId: row.organisation_id ?? null,
      })),
      listings: managed.listings.map(toManagedEvent),
    };
  } catch (error) {
    if (error instanceof ResponseError && error.status === 403) {
      return null;
    }
    throw error;
  }
}

/** A listing's change history, newest first. Empty without organiser access. */
export async function getListingActivity(
  listingId: string
): Promise<ActivityEntry[]> {
  const organiser = await chosenOrganiser();
  try {
    const entries = await eventsGetListingActivity({
      ...(await options()),
      path: { listing_id: listingId },
      ...(organiser ? { query: { organiser } } : {}),
    }).unwrap();
    return entries.map((entry) => {
      const changed: unknown = entry.summary.changed;
      return {
        id: entry.id,
        action: entry.action,
        actorName: entry.actor_name ?? null,
        createdAt: entry.created_at,
        changed: Array.isArray(changed)
          ? changed.filter((name): name is string => typeof name === "string")
          : [],
      };
    });
  } catch (error) {
    if (
      error instanceof ResponseError &&
      (error.status === 403 || error.status === 404)
    ) {
      return [];
    }
    throw error;
  }
}

/** The signed-in member's tickets, soonest event first. */
export async function getMyTickets(): Promise<MyTicket[]> {
  const tickets = await eventsListMyTickets({
    ...(await options()),
  }).unwrap();
  return tickets.map(toMyTicket);
}

export async function getMyTicket(
  ticketId: string
): Promise<MyTicketDetail | null> {
  const ticket = await orNull(
    eventsGetMyTicket({
      ...(await options()),
      path: { ticket_id: ticketId },
    }).unwrap()
  );
  return ticket ? toMyTicketDetail(ticket) : null;
}
