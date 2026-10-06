import type {
  GroupDetail as ApiGroupDetail,
  GroupSummary as ApiGroupSummary,
  PersonChip as ApiPersonChip,
  ThreadDetail as ApiThreadDetail,
  ThreadSummary as ApiThreadSummary,
  ConnectionPublic,
  ListingCard,
  ListingDetail,
  ManagedListing,
  MessagePublic,
  MyProfile,
  NetworkPublic,
  OrganiserPublic,
  PlansPublic,
  ProfilePublic,
} from "@barrelsgd/api-client";
import type {
  Connection,
  EventDetail,
  Group,
  GroupDetail,
  ManagedEvent,
  Message,
  Network,
  Organiser,
  PersonChip,
  PersonProfile,
  Plans,
  Profile,
  PublicEvent,
  ThreadDetail,
  ThreadSummary,
} from "@/domain/types";

/**
 * Pure mappers from the Events API's snake_case shapes to the app's domain
 * types. No I/O, so they are unit-tested and shared by every accessor.
 */

export function toPersonChip(chip: ApiPersonChip): PersonChip {
  return { handle: chip.handle, name: chip.display_name };
}

function money(minor: number, currency: "XCD" | "USD") {
  return { amountMinor: minor, currency };
}

export function toEvent(card: ListingCard): PublicEvent {
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    summary: card.summary,
    description: "",
    category: card.category,
    parish: card.parish,
    venue: card.venue,
    startsAt: card.starts_at,
    endsAt: card.ends_at,
    admission: card.admission,
    priceFrom:
      card.price_from_minor === null
        ? null
        : money(card.price_from_minor, card.currency),
    recurrence: card.recurrence,
    tags: card.tags,
    featured: card.featured,
    organiserSlug: card.organiser_slug,
    goingCount: card.going_count,
    goingNames: card.going_preview.map((chip) => chip.display_name),
    viewerGoing: card.viewer_going ?? null,
    viewerSaved: card.viewer_saved ?? null,
  };
}

export function toOrganiser(organiser: OrganiserPublic): Organiser {
  return {
    id: organiser.id,
    slug: organiser.slug,
    name: organiser.name,
    bio: organiser.bio,
    verified: organiser.verified,
    followerCount: organiser.follower_count,
    viewerFollowing: organiser.viewer_following ?? null,
  };
}

export function toGroup(group: ApiGroupSummary): Group {
  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    tagline: group.tagline,
    category: group.category,
    parish: group.parish,
    joinPolicy: group.join_policy,
    memberCount: group.member_count,
    nextMeetupAt: group.next_listing_starts_at ?? null,
    viewerStatus: group.viewer_status ?? null,
  };
}

export function toEventDetail(listing: ListingDetail): EventDetail {
  return {
    ...toEvent(listing),
    description: listing.description,
    capacity: listing.capacity,
    organiser: toOrganiser(listing.organiser),
    group: listing.group ? toGroup(listing.group) : null,
    tiers: listing.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      allocation: tier.allocation,
      price: money(tier.price_minor, tier.currency),
    })),
  };
}

export function toManagedEvent(listing: ManagedListing): ManagedEvent {
  return {
    ...toEventDetail(listing),
    status: listing.status,
    visibility: listing.visibility,
  };
}

export function toGroupDetail(group: ApiGroupDetail): GroupDetail {
  return {
    ...toGroup(group),
    about: group.about,
    announcements: group.announcements.map((announcement) => ({
      id: announcement.id,
      body: announcement.body,
      postedAt: announcement.posted_at,
      author: announcement.author ? toPersonChip(announcement.author) : null,
    })),
    members: group.members.map((member) => ({
      ...toPersonChip(member),
      headline: member.headline,
      role: member.role,
    })),
    upcoming: group.upcoming.map(toEvent),
    chatThreadId: group.chat_thread_id ?? null,
  };
}

export function toPersonProfile(profile: ProfilePublic): PersonProfile {
  return {
    handle: profile.handle,
    name: profile.display_name,
    headline: profile.headline,
    parish: profile.parish,
    restricted: profile.restricted,
    bio: profile.bio,
    interests: profile.interests,
    intents: profile.intents,
    groups: profile.groups.map(toGroup),
    connectionState: profile.connection_state,
    canMessage: profile.can_message,
    directThreadId: profile.direct_thread_id ?? null,
  };
}

export function toMyProfile(profile: MyProfile): Profile {
  return {
    id: profile.handle,
    handle: profile.handle,
    name: profile.display_name,
    headline: profile.headline,
    bio: profile.bio,
    parish: profile.parish,
    interests: profile.interests,
    intents: profile.intents,
    visibility: profile.visibility,
  };
}

export function toPlans(plans: PlansPublic): Plans {
  return {
    going: plans.going.map(toEvent),
    saved: plans.saved.map(toEvent),
    groups: plans.groups.map(toGroup),
    following: plans.following.map(toOrganiser),
  };
}

function toConnection(connection: ConnectionPublic): Connection {
  return {
    id: connection.id,
    person: toPersonChip(connection.person),
    headline: connection.headline,
    state: connection.state,
  };
}

export function toNetwork(network: NetworkPublic): Network {
  return {
    connections: network.connections.map(toConnection),
    suggestions: network.suggestions.map((person) => ({
      ...toPersonChip(person),
      headline: person.headline,
      intents: person.intents,
    })),
  };
}

export function toThreadSummary(thread: ApiThreadSummary): ThreadSummary {
  return {
    id: thread.id,
    kind: thread.kind,
    title: thread.title,
    groupSlug: thread.group_slug,
    lastMessage: thread.last_message,
    lastSentAt: thread.last_sent_at,
  };
}

function toMessage(message: MessagePublic): Message {
  return {
    id: message.id,
    body: message.body,
    sentAt: message.sent_at,
    mine: message.mine,
    author: message.author ? toPersonChip(message.author) : null,
  };
}

export function toThread(thread: ApiThreadDetail): ThreadDetail {
  return {
    id: thread.id,
    kind: thread.kind,
    title: thread.title,
    groupSlug: thread.group_slug,
    canSend: thread.can_send,
    participants: thread.participants.map(toPersonChip),
    messages: thread.messages.map(toMessage),
  };
}
