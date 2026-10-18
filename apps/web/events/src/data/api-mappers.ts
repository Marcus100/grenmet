import type {
  AdmissionPublic,
  GroupDetail as ApiGroupDetail,
  GroupSummary as ApiGroupSummary,
  OutletSale as ApiOutletSale,
  PersonChip as ApiPersonChip,
  Settlement as ApiSettlement,
  SettlementSummary as ApiSettlementSummary,
  ThreadDetail as ApiThreadDetail,
  ThreadSummary as ApiThreadSummary,
  ConnectionPublic,
  ListingCard,
  ListingDetail,
  ManagedListing,
  Manifest,
  MessagePublic,
  MyProfile,
  NetworkPublic,
  OrganiserPublic,
  OutletOverview,
  PlansPublic,
  ProfilePublic,
  TicketDetail,
  TicketSummary,
  TillPublic,
} from "@barrelsgd/api-client";
import type {
  Connection,
  DoorAdmission,
  DoorManifest,
  EventDetail,
  Group,
  GroupDetail,
  ManagedEvent,
  Message,
  MyTicket,
  MyTicketDetail,
  Network,
  Organiser,
  Outlet,
  OutletSale,
  PersonChip,
  PersonProfile,
  Plans,
  Profile,
  PublicEvent,
  Settlement,
  SettlementCounts,
  SettlementSummary,
  ThreadDetail,
  ThreadSummary,
  Till,
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
    imageFileId: card.image_file_id ?? null,
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
    organisationId: organiser.organisation_id ?? null,
    logoFileId: organiser.logo_file_id ?? null,
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
      held: tier.held ?? 0,
      perAccountLimit: tier.per_account_limit ?? 4,
      price: money(tier.price_minor, tier.currency),
      remaining: tier.remaining ?? 0,
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

export function toMyTicket(ticket: TicketSummary): MyTicket {
  return {
    id: ticket.id,
    code: ticket.code,
    status: ticket.status,
    tierName: ticket.tier_name,
    listingSlug: ticket.listing_slug,
    listingTitle: ticket.listing_title,
    venue: ticket.venue,
    parish: ticket.parish,
    startsAt: ticket.starts_at,
    endsAt: ticket.ends_at,
    canCancel: ticket.can_cancel,
    admittedAt: ticket.admitted_at ?? null,
  };
}

export function toMyTicketDetail(ticket: TicketDetail): MyTicketDetail {
  return { ...toMyTicket(ticket), qrToken: ticket.qr_token };
}

export function toDoorManifest(manifest: Manifest): DoorManifest {
  return {
    listingId: manifest.listing_id,
    title: manifest.title,
    startsAt: manifest.starts_at,
    generatedAt: manifest.generated_at,
    issued: manifest.issued,
    admitted: manifest.admitted,
    waiting: manifest.waiting,
    cancelled: manifest.cancelled,
    rows: manifest.rows.map((row) => ({
      ticketId: row.ticket_id,
      code: row.code,
      holderName: row.holder_name ?? null,
      tierName: row.tier_name,
      admittedAt: row.admitted_at ?? null,
    })),
  };
}

export function toDoorAdmission(admission: AdmissionPublic): DoorAdmission {
  return {
    code: admission.code,
    tierName: admission.tier_name,
    holderName: admission.holder_name ?? null,
    admittedAt: admission.admitted_at,
    admittedByName: admission.admitted_by_name ?? null,
    repeat: admission.repeat ?? false,
  };
}

export function toOutletSale(sale: ApiOutletSale): OutletSale {
  return {
    orderId: sale.order_id,
    listingId: sale.listing_id,
    listingTitle: sale.listing_title,
    venue: sale.venue,
    startsAt: sale.starts_at,
    currency: sale.currency,
    totalMinor: sale.total_minor,
    collectedMinor: sale.collected_minor,
    buyerName: sale.buyer_name ?? null,
    buyerPhone: sale.buyer_phone ?? null,
    soldByName: sale.sold_by_name ?? null,
    createdAt: sale.created_at,
    tickets: sale.tickets.map((ticket) => ({
      id: ticket.id,
      code: ticket.code,
      qrToken: ticket.qr_token,
      tierName: ticket.tier_name,
      priceMinor: ticket.price_minor,
      status: ticket.status,
      admittedAt: ticket.admitted_at ?? null,
    })),
  };
}

export function toTill(till: TillPublic): Till {
  return {
    id: till.id,
    staffName: till.staff_name ?? null,
    day: till.day,
    status: till.status,
    openingFloatMinor: till.opening_float_minor,
    openedAt: till.opened_at,
    closedAt: till.closed_at ?? null,
    salesCount: till.sales_count,
    ticketsSold: till.tickets_sold,
    collectedMinor: till.collected_minor,
    cashRefundsMinor: till.cash_refunds_minor ?? 0,
    expectedMinor: till.expected_minor,
    countedMinor: till.counted_minor ?? null,
    differenceMinor: till.difference_minor ?? null,
    closeNote: till.close_note ?? null,
  };
}

export function toOutlet(outlet: OutletOverview): Outlet {
  return {
    listingId: outlet.listing_id,
    title: outlet.title,
    startsAt: outlet.starts_at,
    selling: outlet.selling,
    tiers: outlet.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      priceMinor: tier.price_minor,
      currency: tier.currency,
      allocation: tier.allocation,
      sold: tier.sold,
      remaining: tier.remaining,
    })),
    till: outlet.till ? toTill(outlet.till) : null,
    sales: outlet.sales.map(toOutletSale),
  };
}

function toSettlementCounts(counts: {
  admitted: number;
  cancelled: number;
  claimed: number;
  issued: number;
  refunded: number;
  value_minor: number;
  waiting: number;
}): SettlementCounts {
  return {
    issued: counts.issued,
    claimed: counts.claimed,
    admitted: counts.admitted,
    waiting: counts.waiting,
    cancelled: counts.cancelled,
    refunded: counts.refunded,
    valueMinor: counts.value_minor,
  };
}

export function toSettlement(report: ApiSettlement): Settlement {
  return {
    listingId: report.listing_id,
    title: report.title,
    startsAt: report.starts_at,
    endsAt: report.ends_at,
    status: report.status,
    currency: report.currency,
    generatedAt: report.generated_at,
    totals: toSettlementCounts(report.totals),
    channels: report.channels.map((channel) => ({
      ...toSettlementCounts(channel),
      channel: channel.channel,
      collectedMinor: channel.collected_minor,
      refundedMinor: channel.refunded_minor,
    })),
    tiers: report.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      priceMinor: tier.price_minor,
      allocation: tier.allocation,
      online: tier.online,
      outlet: tier.outlet,
      admitted: tier.admitted,
      remaining: tier.remaining,
    })),
    tills: report.tills.map(toTill),
    cash: {
      collectedMinor: report.cash.collected_minor,
      cashRefundsMinor: report.cash.cash_refunds_minor,
      netSalesMinor: report.cash.net_sales_minor,
      expectedMinor: report.cash.expected_minor,
      countedMinor: report.cash.counted_minor,
      differenceMinor: report.cash.difference_minor,
      openTills: report.cash.open_tills,
      closedTills: report.cash.closed_tills,
    },
    discrepancies: report.discrepancies.map((issue) => ({
      kind: issue.kind,
      message: issue.message,
      tillId: issue.till_id ?? null,
      amountMinor: issue.amount_minor ?? null,
    })),
  };
}

export function toSettlementSummary(
  row: ApiSettlementSummary
): SettlementSummary {
  return {
    listingId: row.listing_id,
    title: row.title,
    startsAt: row.starts_at,
    status: row.status,
    issued: row.issued,
    claimed: row.claimed,
    admitted: row.admitted,
    cancelled: row.cancelled,
    cashCollectedMinor: row.cash_collected_minor,
    cashExpectedMinor: row.cash_expected_minor,
    cashCountedMinor: row.cash_counted_minor,
    issues: row.issues,
  };
}
