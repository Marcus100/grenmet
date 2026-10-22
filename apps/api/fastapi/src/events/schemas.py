"""API shapes for Barrels Events. Datetimes are UTC; clients render Grenada time."""

import uuid
from datetime import date
from typing import Literal

from pydantic import Field

from src.models import BaseModel, UtcDateTime

Category = Literal[
    "fete",
    "music",
    "food",
    "sport",
    "business",
    "tech",
    "culture",
    "faith",
    "family",
    "wellness",
]
Parish = Literal[
    "st-george",
    "st-andrew",
    "st-david",
    "st-patrick",
    "st-mark",
    "st-john",
    "carriacou",
]
Admission = Literal["free", "rsvp", "ticketed"]
Intent = Literal[
    "making-friends", "hiring", "looking-for-work", "collaborating", "mentoring"
]
ConnectionState = Literal["self", "none", "connected", "sent", "received", "blocked"]
When = Literal["tonight", "weekend", "week", "month"]

HANDLE_PATTERN = r"^[a-z0-9][a-z0-9-]{1,29}$"
SLUG_PATTERN = r"^[a-z0-9][a-z0-9-]{1,79}$"


class PersonChip(BaseModel):
    handle: str
    display_name: str


class TierPublic(BaseModel):
    id: uuid.UUID
    name: str
    price_minor: int
    currency: Literal["XCD", "USD"]
    allocation: int
    #: Most valid tickets one account may hold for this tier.
    per_account_limit: int = 4
    #: Tickets still available (allocation minus valid tickets).
    remaining: int = 0
    #: Valid tickets the signed-in viewer holds for this tier (0 when signed out).
    held: int = 0


class ListingCard(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    summary: str
    category: Category
    parish: Parish
    venue: str
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    admission: Admission
    price_from_minor: int | None
    currency: Literal["XCD", "USD"]
    recurrence: str | None
    tags: list[str]
    featured: bool
    #: Stored cover image; render through the public storage redirect.
    image_file_id: uuid.UUID | None = None
    organiser_slug: str
    going_count: int
    going_preview: list[PersonChip]
    #: Null for anonymous visitors.
    viewer_going: bool | None = None
    viewer_saved: bool | None = None


class ListingCardList(BaseModel):
    data: list[ListingCard]
    count: int


class OrganiserPublic(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    bio: str
    verified: bool
    organisation_id: str | None = None
    #: Stored logo; render through the public storage redirect.
    logo_file_id: uuid.UUID | None = None
    follower_count: int
    viewer_following: bool | None = None


class GroupSummary(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    tagline: str
    category: Category
    parish: Parish
    join_policy: Literal["open", "approval"]
    member_count: int
    next_listing_starts_at: UtcDateTime | None = None
    viewer_status: Literal["host", "member", "pending"] | None = None


class AnnouncementPublic(BaseModel):
    id: uuid.UUID
    author: PersonChip | None
    body: str
    posted_at: UtcDateTime


class GroupMemberPublic(PersonChip):
    headline: str
    role: Literal["host", "member"]


class GroupDetail(GroupSummary):
    about: str
    announcements: list[AnnouncementPublic]
    members: list[GroupMemberPublic]
    upcoming: list[ListingCard]
    chat_thread_id: uuid.UUID | None = None


class ListingDetail(ListingCard):
    description: str
    capacity: int
    organiser: OrganiserPublic
    group: GroupSummary | None
    tiers: list[TierPublic]


class PersonSuggestion(PersonChip):
    headline: str
    intents: list[Intent]


class ProfilePublic(BaseModel):
    handle: str
    display_name: str
    headline: str
    parish: Parish
    #: True when visibility hides details from this viewer.
    restricted: bool
    bio: str | None
    interests: list[Category]
    intents: list[Intent]
    groups: list[GroupSummary]
    connection_state: ConnectionState
    can_message: bool
    direct_thread_id: uuid.UUID | None = None


class MyProfile(BaseModel):
    handle: str
    display_name: str
    headline: str
    bio: str
    parish: Parish
    interests: list[Category]
    intents: list[Intent]
    visibility: Literal["public", "connections"]


class ProfileUpdate(BaseModel):
    handle: str | None = Field(default=None, pattern=HANDLE_PATTERN)
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    headline: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=1000)
    parish: Parish | None = None
    interests: list[Category] | None = Field(default=None, max_length=10)
    intents: list[Intent] | None = Field(default=None, max_length=5)
    visibility: Literal["public", "connections"] | None = None


class PlansPublic(BaseModel):
    going: list[ListingCard]
    saved: list[ListingCard]
    groups: list[GroupSummary]
    following: list[OrganiserPublic]


class ConnectionPublic(BaseModel):
    id: uuid.UUID
    person: PersonChip
    headline: str
    state: Literal["connected", "sent", "received"]


class NetworkPublic(BaseModel):
    connections: list[ConnectionPublic]
    suggestions: list[PersonSuggestion]


class ConnectionCreate(BaseModel):
    handle: str = Field(pattern=HANDLE_PATTERN)


class ReportCreate(BaseModel):
    subject_type: Literal["profile", "message", "group", "listing"]
    subject_id: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=3, max_length=1000)


class MessagePublic(BaseModel):
    id: uuid.UUID
    author: PersonChip | None
    body: str
    sent_at: UtcDateTime
    mine: bool


class ThreadSummary(BaseModel):
    id: uuid.UUID
    kind: Literal["direct", "group"]
    title: str
    group_slug: str | None
    last_message: str | None
    last_sent_at: UtcDateTime | None


class ThreadDetail(BaseModel):
    id: uuid.UUID
    kind: Literal["direct", "group"]
    title: str
    group_slug: str | None
    participants: list[PersonChip]
    messages: list[MessagePublic]
    can_send: bool


class ThreadCreate(BaseModel):
    handle: str = Field(pattern=HANDLE_PATTERN)


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class SuggestionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    event_date: date
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    venue: str = Field(min_length=2, max_length=160)
    category: Category
    parish: Parish
    source: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=1000)


class SuggestionPublic(SuggestionCreate):
    id: uuid.UUID
    status: Literal["pending", "approved", "rejected"]
    created_at: UtcDateTime


class SuggestionUpdate(BaseModel):
    status: Literal["approved", "rejected"]


class ReportPublic(ReportCreate):
    id: uuid.UUID
    status: Literal["open", "actioned", "dismissed"]
    created_at: UtcDateTime


class ReportUpdate(BaseModel):
    status: Literal["actioned", "dismissed"]


class TierInput(BaseModel):
    #: Existing tier to update in place; omit to add one. Tiers with tickets
    #: issued keep their identity across saves.
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=60)
    price_minor: int = Field(ge=0, le=10_000_000)
    currency: Literal["XCD", "USD"] = "XCD"
    allocation: int = Field(ge=0, le=1_000_000)
    per_account_limit: int = Field(default=4, ge=1, le=50)


class ListingUpsert(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    summary: str = Field(min_length=10, max_length=160)
    description: str = Field(default="", max_length=8000)
    category: Category
    parish: Parish
    venue: str = Field(min_length=2, max_length=160)
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    admission: Admission
    capacity: int = Field(ge=0, le=1_000_000)
    recurrence: str | None = Field(default=None, max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=10)
    visibility: Literal["public", "unlisted"] = "public"
    status: Literal["draft", "published", "cancelled"] = "draft"
    group_slug: str | None = Field(default=None, pattern=SLUG_PATTERN)
    tiers: list[TierInput] = Field(default_factory=list, max_length=20)
    #: A completed `listing-image` upload of this organiser; null clears it.
    image_file_id: uuid.UUID | None = None


class ManagedListing(ListingDetail):
    status: Literal["draft", "published", "cancelled"]
    visibility: Literal["public", "unlisted"]


class OrganiserOption(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    organisation_id: str | None = None
    verified: bool = False


class OrganiserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str | None = Field(default=None, pattern=SLUG_PATTERN, max_length=60)
    bio: str = Field(default="", max_length=500)


class OrganiserLogoUpdate(BaseModel):
    #: A completed `organiser-logo` upload of this organiser; null clears it.
    file_id: uuid.UUID | None = None


class OrganiserReview(BaseModel):
    verified: bool


class ManagedOrganiser(OrganiserPublic):
    organisers: list[OrganiserOption]
    listings: list[ManagedListing]


class ActivityEntry(BaseModel):
    id: uuid.UUID
    action: str
    entity_type: str
    entity_id: str
    actor_id: uuid.UUID
    #: Display name from the actor's current profile; null once they have none.
    actor_name: str | None = None
    summary: dict[str, object]
    created_at: UtcDateTime


class OrderItemInput(BaseModel):
    tier_id: uuid.UUID
    quantity: int = Field(ge=1, le=50)


class OrderCreate(BaseModel):
    items: list[OrderItemInput] = Field(min_length=1, max_length=10)


class TicketSummary(BaseModel):
    id: uuid.UUID
    #: Opaque code printed under the QR, for manual entry at the door.
    code: str
    status: Literal["valid", "cancelled", "refunded"]
    tier_name: str
    listing_slug: str
    listing_title: str
    venue: str
    parish: Parish
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    #: Valid, the event has not started and the holder has not been admitted.
    can_cancel: bool
    #: Set once door staff admit the ticket.
    admitted_at: UtcDateTime | None = None


class TicketDetail(TicketSummary):
    #: Signed token to render as the ticket's QR code. Carries no personal data.
    qr_token: str


class OrderPublic(BaseModel):
    id: uuid.UUID
    listing_slug: str
    total_minor: int
    currency: Literal["XCD", "USD"]
    created_at: UtcDateTime
    #: Empty while a paid order is ``pending_payment``; issued once it is paid.
    tickets: list[TicketSummary]
    #: ``pending_payment`` holds the tickets until ``payment_expires_at``;
    #: ``expired`` released them; ``refunded`` was paid and handed back.
    status: Literal["confirmed", "pending_payment", "expired", "refunded"] = "confirmed"
    #: True while the order waits for money.
    payment_required: bool = False
    #: Hosted checkout for the buyer. Null when staff record the payment (the
    #: manual rail) or when nothing is owed.
    checkout_url: str | None = None
    payment_expires_at: UtcDateTime | None = None


class AdmissionCreate(BaseModel):
    #: The scanned QR token, or a ticket code typed or read by a keyboard scanner.
    code: str = Field(min_length=1, max_length=200)
    #: Client-generated key; a retry with the same key replays its own success.
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=64)


class AdmissionPublic(BaseModel):
    ticket_id: uuid.UUID
    code: str
    tier_name: str
    #: Ticket holder's display name; null when they have no Events profile.
    holder_name: str | None = None
    admitted_at: UtcDateTime
    admitted_by_name: str | None = None
    #: True when this response replays an earlier scan with the same key.
    repeat: bool = False


class ManifestRow(BaseModel):
    ticket_id: uuid.UUID
    code: str
    holder_name: str | None = None
    tier_name: str
    admitted_at: UtcDateTime | None = None
    #: "online" (member claim) or "outlet" (cash sale by staff).
    channel: Literal["online", "outlet"] = "online"


class Manifest(BaseModel):
    listing_id: uuid.UUID
    title: str
    starts_at: UtcDateTime
    generated_at: UtcDateTime
    #: Valid tickets (cancelled ones are not expected at the door).
    issued: int
    admitted: int
    waiting: int
    cancelled: int
    rows: list[ManifestRow]


class RefundCreate(BaseModel):
    amount_minor: int = Field(ge=1, le=100_000_000)
    method: Literal["cash", "bank"]
    #: Bank transfer reference; required for bank refunds.
    reference: str | None = Field(default=None, max_length=120)


class PostponeResult(BaseModel):
    listing_id: uuid.UUID
    starts_at: UtcDateTime
    ends_at: UtcDateTime


class RefundPublic(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    code: str
    tier_name: str
    amount_minor: int
    method: Literal["cash", "bank"]
    reference: str | None = None
    refunded_by_name: str | None = None
    refunded_at: UtcDateTime
    till_session_id: uuid.UUID | None = None


# --- Outlet cash sales (E3) -------------------------------------------------------------

Currency = Literal["XCD", "USD"]


class OutletItemInput(BaseModel):
    tier_id: uuid.UUID
    quantity: int = Field(ge=1, le=50)


class OutletSaleCreate(BaseModel):
    items: list[OutletItemInput] = Field(min_length=1, max_length=10)
    #: Cash taken, in minor units of the tier currency. Must equal the price total.
    amount_collected_minor: int = Field(ge=0, le=100_000_000)
    buyer_name: str | None = Field(default=None, max_length=120)
    buyer_phone: str | None = Field(default=None, max_length=40)
    #: Client-generated key; a retried sale replays the original instead of selling twice.
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=64)


class OutletTicket(BaseModel):
    id: uuid.UUID
    code: str
    #: Signed token to print as the ticket's QR code. Carries no personal data.
    qr_token: str
    tier_name: str
    price_minor: int
    status: Literal["valid", "cancelled", "refunded"]
    admitted_at: UtcDateTime | None = None
    #: Refund recorded for this ticket, if any.
    refund: RefundPublic | None = None
    #: A cash outlet ticket that can still be refunded.
    can_refund: bool = False


class OutletSale(BaseModel):
    order_id: uuid.UUID
    listing_id: uuid.UUID
    listing_title: str
    venue: str
    starts_at: UtcDateTime
    currency: Currency
    total_minor: int
    collected_minor: int
    buyer_name: str | None = None
    buyer_phone: str | None = None
    sold_by_name: str | None = None
    till_session_id: uuid.UUID | None = None
    created_at: UtcDateTime
    #: True when this response replays an earlier sale with the same key.
    repeat: bool = False
    tickets: list[OutletTicket]


class TillOpen(BaseModel):
    opening_float_minor: int = Field(ge=0, le=100_000_000)


class TillClose(BaseModel):
    counted_minor: int = Field(ge=0, le=1_000_000_000)
    note: str | None = Field(default=None, max_length=300)


class TillPublic(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    staff_name: str | None = None
    #: Grenada calendar day the till was opened.
    day: date
    status: Literal["open", "closed"]
    opening_float_minor: int
    opened_at: UtcDateTime
    closed_at: UtcDateTime | None = None
    sales_count: int
    tickets_sold: int
    collected_minor: int
    #: Cash handed back as refunds from this till.
    cash_refunds_minor: int = 0
    #: Float plus takings minus cash refunds.
    expected_minor: int
    counted_minor: int | None = None
    #: Counted minus expected once closed (negative is short, positive is over).
    difference_minor: int | None = None
    close_note: str | None = None


class OutletTierStock(BaseModel):
    id: uuid.UUID
    name: str
    price_minor: int
    currency: Currency
    allocation: int
    sold: int
    remaining: int


class OutletOverview(BaseModel):
    listing_id: uuid.UUID
    title: str
    starts_at: UtcDateTime
    status: Literal["draft", "published", "cancelled"]
    #: Whether the event can still be sold (published, ticketed, not ended).
    selling: bool
    tiers: list[OutletTierStock]
    #: The caller's till for the current open session or today's closed one.
    till: TillPublic | None = None
    #: Recent outlet sales for the event, newest first.
    sales: list[OutletSale]


# --- Settlement (E4) ----------------------------------------------------------------------


class SettlementCounts(BaseModel):
    """Ticket counts. ``claimed`` is issued minus cancelled and refunded."""

    issued: int
    claimed: int
    admitted: int
    #: Claimed but not yet admitted.
    waiting: int
    cancelled: int
    refunded: int
    #: Face value of claimed tickets, in minor units.
    value_minor: int


class SettlementChannel(SettlementCounts):
    channel: Literal["online", "outlet_cash"]
    #: Money taken: cash at the outlet, or the online payments captured.
    collected_minor: int
    #: Refunds recorded against this channel's tickets.
    refunded_minor: int


class SettlementTier(BaseModel):
    id: uuid.UUID
    name: str
    price_minor: int
    allocation: int
    online: int
    outlet: int
    admitted: int
    remaining: int


class SettlementCash(BaseModel):
    """Cash across every till. Difference counts closed tills only."""

    collected_minor: int
    cash_refunds_minor: int
    #: Takings after cash refunds, excluding opening floats.
    net_sales_minor: int
    expected_minor: int
    counted_minor: int
    difference_minor: int
    open_tills: int
    closed_tills: int


class SettlementIssue(BaseModel):
    kind: Literal[
        "till_short",
        "till_over",
        "till_open",
        "refund_without_till",
        "online_ledger_mismatch",
    ]
    message: str
    till_id: uuid.UUID | None = None
    amount_minor: int | None = None


class SettlementOnlinePayments(BaseModel):
    """Online (paid tier) orders against the payments ledger (N4b).

    The Events side comes from the orders; the ledger side is the sum of the
    ``events.order`` intents for this event in the payments ledger (charges and
    refunds). Orders and the payments ledger are compared, not joined.
    """

    orders_paid: int
    #: Orders waiting for money; their stock is held but nothing is collected.
    orders_pending: int
    pending_minor: int
    collected_minor: int
    refunded_minor: int
    #: From the payments ledger; null when the ledger could not be read.
    ledger_collected_minor: int | None = None
    ledger_refunded_minor: int | None = None
    #: True when both sides agree; null when the ledger could not be read.
    reconciled: bool | None = None


class Settlement(BaseModel):
    listing_id: uuid.UUID
    title: str
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    status: Literal["draft", "published", "cancelled"]
    currency: Literal["XCD", "USD"]
    generated_at: UtcDateTime
    totals: SettlementCounts
    channels: list[SettlementChannel]
    tiers: list[SettlementTier]
    tills: list[TillPublic]
    cash: SettlementCash
    discrepancies: list[SettlementIssue]
    refunds: list[RefundPublic]
    online_payments: SettlementOnlinePayments | None = None


class SettlementSummary(BaseModel):
    listing_id: uuid.UUID
    title: str
    starts_at: UtcDateTime
    status: Literal["draft", "published", "cancelled"]
    issued: int
    claimed: int
    admitted: int
    cancelled: int
    cash_collected_minor: int
    cash_expected_minor: int
    cash_counted_minor: int
    #: Online payments captured for the event (paid tiers).
    online_collected_minor: int = 0
    issues: int


class SettlementOverview(BaseModel):
    organiser_name: str
    listings: list[SettlementSummary]


# --- Cancel, postpone and refund (E5) ---------------------------------------------------


#: What happens to money already paid when an organiser cancels. ``full`` hands
#: everything back, ``none`` keeps it, ``follow_policy`` applies the organiser's
#: refund policy (an event the organiser cancels is refunded in full; a single
#: order is refunded when the event is at least the policy cutoff away).
RefundChoice = Literal["full", "none", "follow_policy"]


class CancelEvent(BaseModel):
    #: Must be true; guards against an accidental call.
    confirm: Literal[True]
    refund: RefundChoice = Field(
        default="follow_policy",
        description="What to do with money already paid for online orders.",
    )


class CancelResult(BaseModel):
    listing_id: uuid.UUID
    status: Literal["cancelled"]
    #: Valid tickets cancelled with the event (holders are notified).
    tickets_cancelled: int
    #: Paid online orders refunded in full by this cancel.
    orders_refunded: int = 0
    #: Paid online orders whose money was kept (refund choice ``none``).
    orders_kept: int = 0
    #: Paid online orders whose refund failed; refund them from the orders page.
    refunds_failed: int = 0
    #: Unpaid orders released because the event is off.
    orders_released: int = 0


class PostponeEvent(BaseModel):
    starts_at: UtcDateTime
    ends_at: UtcDateTime


# --- Organiser orders (org zone) ----------------------------------------------------

OrgOrderStatus = Literal["confirmed", "pending_payment", "expired", "refunded"]
OrgTicketStatus = Literal["valid", "cancelled", "refunded"]


class OrgOrderRow(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    status: OrgOrderStatus
    channel: Literal["online", "outlet"]
    payment_method: Literal["none", "cash_outlet", "online"]
    buyer_name: str | None
    total_minor: int
    currency: str
    collected_minor: int
    refunded_minor: int
    #: All tickets on the order, including cancelled and refunded ones.
    ticket_count: int
    #: Tickets that still work (valid): 0 after a cancel that kept the money.
    active_ticket_count: int
    created_at: UtcDateTime
    paid_at: UtcDateTime | None


class OrgOrderList(BaseModel):
    data: list[OrgOrderRow]
    count: int
    page: int
    size: int


class OrgOrderItem(BaseModel):
    tier_id: uuid.UUID
    tier_name: str
    quantity: int
    unit_price_minor: int


class OrgOrderTicket(BaseModel):
    id: uuid.UUID
    code: str
    status: OrgTicketStatus
    tier_name: str
    admitted_at: UtcDateTime | None


class OrgOrderPayment(BaseModel):
    intent_id: uuid.UUID
    provider: str
    status: str
    captured_minor: int
    refunded_minor: int
    #: What can still be handed back through the payments core.
    refundable_minor: int


class OrgOrderDetail(OrgOrderRow):
    listing_title: str
    buyer_email: str | None
    buyer_phone: str | None
    payment_expires_at: UtcDateTime | None
    items: list[OrgOrderItem]
    tickets: list[OrgOrderTicket]
    payment: OrgOrderPayment | None


class OrgAttendee(BaseModel):
    ticket_id: uuid.UUID
    order_id: uuid.UUID
    code: str
    status: OrgTicketStatus
    tier_id: uuid.UUID
    tier_name: str
    holder_name: str | None
    channel: Literal["online", "outlet"]
    admitted_at: UtcDateTime | None


class OrgAttendeeList(BaseModel):
    data: list[OrgAttendee]
    count: int
    page: int
    size: int


class OrgManualPaymentCreate(BaseModel):
    method: Literal["cash", "bank_transfer"]
    reference: str | None = Field(
        default=None, max_length=200, description="Receipt or transfer number."
    )


class OrgOrderRefundCreate(BaseModel):
    amount_minor: int | None = Field(
        default=None,
        ge=1,
        le=1_000_000_000,
        description="Defaults to everything still refundable.",
    )
    reason: str = Field(min_length=3, max_length=500)


class OrgOrderCancel(BaseModel):
    reason: str | None = Field(default=None, max_length=300)
    refund: RefundChoice = Field(
        default="follow_policy",
        description="What to do with money already paid for this order.",
    )


class OrgOrderCancelResult(BaseModel):
    order: OrgOrderDetail
    #: ``refunded`` money went back, ``kept`` it was not, ``not_due`` nothing was paid.
    refund_outcome: Literal["refunded", "kept", "not_due"]
