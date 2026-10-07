"""Events tables use separate metadata; main-database Alembic must not see them.

Migrations are hand-written in ``migrations/versions``; these models mirror
them. Users are referenced by auth ``user_id`` with no foreign key (ADR-0003).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, MetaData, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from src.utils.datetime import utc_now

events_metadata = MetaData()


class EventsModel(DeclarativeBase):
    """Declarative base for the independently migrated events database."""

    metadata = events_metadata


class Organiser(EventsModel):
    __tablename__ = "organisers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    bio: Mapped[str] = mapped_column(Text, default="")
    verified: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class OrganiserMember(EventsModel):
    __tablename__ = "organiser_members"
    organiser_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisers.id"), primary_key=True
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
        ForeignKey("groups.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(Text, default="member")
    status: Mapped[str] = mapped_column(Text, default="active")
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Announcement(EventsModel):
    __tablename__ = "announcements"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("groups.id"))
    author_id: Mapped[uuid.UUID]
    body: Mapped[str] = mapped_column(Text)
    posted_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


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
    organiser_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisers.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    featured: Mapped[bool] = mapped_column(default=False)
    recurrence: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    status: Mapped[str] = mapped_column(Text, default="draft")
    visibility: Mapped[str] = mapped_column(Text, default="public")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class TicketTier(EventsModel):
    __tablename__ = "ticket_tiers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id"))
    name: Mapped[str] = mapped_column(Text)
    price_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(Text, default="XCD")
    allocation: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Rsvp(EventsModel):
    __tablename__ = "rsvps"
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class SavedListing(EventsModel):
    __tablename__ = "saved_listings"
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class Follow(EventsModel):
    __tablename__ = "follows"
    organiser_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisers.id"), primary_key=True
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
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    #: "<smaller uuid>:<larger uuid>" for direct threads, so each pair has one.
    direct_key: Mapped[str | None] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ThreadParticipant(EventsModel):
    __tablename__ = "thread_participants"
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("threads.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class Message(EventsModel):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("threads.id"))
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
