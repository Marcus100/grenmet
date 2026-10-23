"""Events tables (main database, ``events`` schema; ADR-0003).

Migrated by the main Alembic chain. Users are referenced by auth ``user_id``
without a foreign key (the auth tables are another module's); payments and
organisations are referenced by plain ids too, so Events never joins another
module's tables (ADR-0003).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.engine.default import DefaultExecutionContext
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class EventsModel(Base):
    """Declarative base for every table in the ``events`` schema."""

    __abstract__ = True
    __table_args__ = {"schema": "events"}


class Organiser(EventsModel):
    __tablename__ = "organisers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    bio: Mapped[str] = mapped_column(Text, default="")
    verified: Mapped[bool] = mapped_column(default=False)
    # Platform ``org.organisation.id`` (main database, no cross-DB FK); NULL = legacy.
    organisation_id: Mapped[str | None] = mapped_column(Text, unique=True)
    #: Completed organisation upload (purpose organiser-logo); no cross-DB FK.
    logo_file_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class OrganiserMember(EventsModel):
    __tablename__ = "organiser_members"
    organiser_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.organisers.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class MemberProfile(EventsModel):
    __tablename__ = "member_profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    handle: Mapped[str] = mapped_column(Text, unique=True)
    display_name: Mapped[str] = mapped_column(Text)
    headline: Mapped[str] = mapped_column(Text, default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    parish: Mapped[str] = mapped_column(Text, default="st-george")
    interests: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    intents: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    visibility: Mapped[str] = mapped_column(Text, default="public")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Group(EventsModel):
    __tablename__ = "groups"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    tagline: Mapped[str] = mapped_column(Text, default="")
    about: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(Text)
    parish: Mapped[str] = mapped_column(Text)
    join_policy: Mapped[str] = mapped_column(Text, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class GroupMember(EventsModel):
    __tablename__ = "group_members"
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.groups.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(Text, default="member")
    status: Mapped[str] = mapped_column(Text, default="active")
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Announcement(EventsModel):
    __tablename__ = "announcements"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.groups.id"))
    author_id: Mapped[uuid.UUID]
    body: Mapped[str] = mapped_column(Text)
    posted_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


def _default_booking_mode(context: DefaultExecutionContext) -> str:
    """Legacy ``admission`` -> ``booking_mode`` for rows built without one."""
    admission = context.get_current_parameters().get("admission")  # type: ignore[no-untyped-call]
    return {"rsvp": "rsvp", "ticketed": "tickets"}.get(str(admission), "none")


class Category(EventsModel):
    """Taxonomy reference data: top-level categories and their subcategories."""

    __tablename__ = "categories"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.categories.id"), default=None
    )
    #: Listing types this category may be used with.
    applies_to: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(default=True)
    #: Frozen ten-value ``listings.category`` this maps to (lossy, ADR-0046).
    legacy_category: Mapped[str | None] = mapped_column(Text, default=None)


class Listing(EventsModel):
    """A public event listing (named to avoid clashing with Python/HTTP "event")."""

    __tablename__ = "listings"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(Text)
    parish: Mapped[str] = mapped_column(Text)
    venue: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    admission: Mapped[str] = mapped_column(Text)
    capacity: Mapped[int] = mapped_column(Integer, default=0)
    organiser_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.organisers.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.groups.id"))
    featured: Mapped[bool] = mapped_column(default=False)
    #: Completed organisation upload (purpose listing-image); no cross-DB FK.
    image_file_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    recurrence: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    status: Mapped[str] = mapped_column(Text, default="draft")
    visibility: Mapped[str] = mapped_column(Text, default="public")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    # Catalogue classification (ADR-0046, migration eventstaxonomy20261022).
    listing_type: Mapped[str] = mapped_column(Text, default="event")
    access_type: Mapped[str] = mapped_column(Text, default="public")
    pricing_type: Mapped[str] = mapped_column(Text, default="free")
    booking_mode: Mapped[str] = mapped_column(Text, default=_default_booking_mode)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.categories.id"), default=None
    )
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.categories.id"), default=None
    )
    external_ticket_url: Mapped[str | None] = mapped_column(Text, default=None)
    curated: Mapped[bool] = mapped_column(default=False)


class TicketTier(EventsModel):
    __tablename__ = "ticket_tiers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.listings.id"))
    name: Mapped[str] = mapped_column(Text)
    price_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(Text, default="XCD")
    allocation: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    #: Most valid tickets one account may hold for this tier (E1).
    per_account_limit: Mapped[int] = mapped_column(Integer, default=4)


class Rsvp(EventsModel):
    __tablename__ = "rsvps"
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.listings.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class SavedListing(EventsModel):
    __tablename__ = "saved_listings"
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.listings.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class Follow(EventsModel):
    __tablename__ = "follows"
    organiser_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.organisers.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class Connection(EventsModel):
    __tablename__ = "connections"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requester_id: Mapped[uuid.UUID]
    addressee_id: Mapped[uuid.UUID]
    status: Mapped[str] = mapped_column(Text, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Block(EventsModel):
    __tablename__ = "blocks"
    blocker_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    blocked_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Report(EventsModel):
    __tablename__ = "reports"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID]
    subject_type: Mapped[str] = mapped_column(Text)
    subject_id: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Thread(EventsModel):
    __tablename__ = "threads"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(Text)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.groups.id"))
    #: "<smaller uuid>:<larger uuid>" for direct threads, so each pair has one.
    direct_key: Mapped[str | None] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ThreadParticipant(EventsModel):
    __tablename__ = "thread_participants"
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.threads.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class Message(EventsModel):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.threads.id"))
    author_id: Mapped[uuid.UUID]
    body: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Suggestion(EventsModel):
    __tablename__ = "suggestions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    submitted_by: Mapped[uuid.UUID | None]
    title: Mapped[str] = mapped_column(Text)
    event_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[str | None] = mapped_column(Text)
    venue: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    parish: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(Text, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Activity(EventsModel):
    """Append-only history (F7). A database trigger rejects UPDATE and DELETE."""

    __tablename__ = "activity"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organiser_id: Mapped[uuid.UUID | None]
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID]
    # 'member' or 'staff' (Barrels staff acting on an organiser's event, ADR-0050).
    actor_capacity: Mapped[str] = mapped_column(
        Text, default="member", server_default="member"
    )
    summary: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class TillSession(EventsModel):
    """One staff member's cash till for a listing and Grenada day (E3)."""

    __tablename__ = "till_sessions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.listings.id"))
    staff_id: Mapped[uuid.UUID]
    day: Mapped[date] = mapped_column(Date)
    opening_float_minor: Mapped[int] = mapped_column(Integer, default=0)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    counted_minor: Mapped[int | None] = mapped_column(Integer)
    close_note: Mapped[str | None] = mapped_column(Text)


class Order(EventsModel):
    """A claim of tickets: an account's free claim (E1) or an outlet cash sale (E3)."""

    __tablename__ = "orders"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.listings.id"))
    #: The claiming account; null for outlet sales (the buyer has no account).
    user_id: Mapped[uuid.UUID | None]
    #: confirmed | pending_payment | expired | refunded (N4b).
    status: Mapped[str] = mapped_column(Text, default="confirmed")
    total_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(Text, default="XCD")
    #: "online" (member claim) or "outlet" (sold by the organiser's staff).
    channel: Mapped[str] = mapped_column(Text, default="online")
    #: "none" for free claims, "cash_outlet" for outlet cash sales, "online" for
    #: paid tiers collected through the payments core.
    payment_method: Mapped[str] = mapped_column(Text, default="none")
    collected_minor: Mapped[int] = mapped_column(Integer, default=0)
    buyer_name: Mapped[str | None] = mapped_column(Text)
    buyer_phone: Mapped[str | None] = mapped_column(Text)
    sold_by: Mapped[uuid.UUID | None]
    till_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.till_sessions.id")
    )
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    #: ``payments.intent.id`` in the main database (ADR-0003: no cross-database FK).
    payment_intent_id: Mapped[uuid.UUID | None]
    #: A ``pending_payment`` order holds its stock until then (N4b).
    payment_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    #: Mirrors the payments ledger (``collected_minor`` holds the charge).
    refunded_minor: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class OrderItem(EventsModel):
    __tablename__ = "order_items"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.orders.id"))
    tier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.ticket_tiers.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price_minor: Mapped[int] = mapped_column(Integer, default=0)


class Ticket(EventsModel):
    """One admission. ``code`` is opaque and random; it carries no personal data."""

    __tablename__ = "tickets"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.orders.id"))
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.listings.id"))
    tier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.ticket_tiers.id"))
    #: Holder account; null for outlet tickets (the order has the buyer's name).
    user_id: Mapped[uuid.UUID | None]
    code: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[str] = mapped_column(Text, default="valid")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)


class Admission(EventsModel):
    """A ticket admitted at the door (E2). ``ticket_id`` is unique: admitted once."""

    __tablename__ = "admissions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.tickets.id"), unique=True
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.listings.id"))
    admitted_by: Mapped[uuid.UUID]
    admitted_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    #: "qr" for a scanned token, "code" for a typed or keyboard-wedge code.
    method: Mapped[str] = mapped_column(Text, default="qr")
    idempotency_key: Mapped[str | None] = mapped_column(Text)


class Refund(EventsModel):
    """Money handed back for an outlet cash ticket (E5). One per ticket."""

    __tablename__ = "refunds"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.listings.id"))
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.orders.id"))
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.tickets.id"), unique=True
    )
    amount_minor: Mapped[int] = mapped_column(Integer)
    #: "cash" (paid from a till) or "bank".
    method: Mapped[str] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(Text)
    refunded_by: Mapped[uuid.UUID]
    refunded_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    #: The till a cash refund was paid from, if one was open.
    till_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.till_sessions.id")
    )
