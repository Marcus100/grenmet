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
    name: str = Field(min_length=1, max_length=60)
    price_minor: int = Field(ge=0, le=10_000_000)
    currency: Literal["XCD", "USD"] = "XCD"
    allocation: int = Field(ge=0, le=1_000_000)


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


class ManagedListing(ListingDetail):
    status: Literal["draft", "published", "cancelled"]
    visibility: Literal["public", "unlisted"]


class ManagedOrganiser(OrganiserPublic):
    listings: list[ManagedListing]
