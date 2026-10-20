"""Gamification tables (PF9, ``rewards`` schema): venues, trails, check-ins, achievements.

A check-in is a real-world visit proven by a rotating signed QR code at the
venue, never an app-open event. Trail progress and achievements are derived from
these records; nothing here holds value, ranks people or can be bought.
"""

import uuid
from datetime import date, datetime
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

from .models import _values


class TrailKind(str, Enum):
    PARISH = "parish"
    FESTIVAL = "festival"
    CUSTOM = "custom"


class TrailStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class AchievementRule(str, Enum):
    ATTENDED_N_EVENTS = "attended_n_events"
    VISITED_ALL_STOPS_OF_TRAIL = "visited_all_stops_of_trail"
    STREAK_DAYS = "streak_days"


class Venue(Base):
    """A place with a rotating QR display. ``secret_encrypted`` never leaves the API."""

    __tablename__ = "venue"
    __table_args__ = (
        sa.Index("ix_rewards_venue_organisation", "organisation_id"),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    name: Mapped[str] = mapped_column(String(120))
    secret_encrypted: Mapped[str] = mapped_column(sa.Text)
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class Trail(Base):
    """An ordered set of venues to visit. ``organisation_id`` NULL = platform trail."""

    __tablename__ = "trail"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(TrailKind)})", name="kind"),
        sa.CheckConstraint(f"status IN ({_values(TrailStatus)})", name="status"),
        sa.CheckConstraint(
            "starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on",
            name="window",
        ),
        sa.Index("ix_rewards_trail_organisation", "organisation_id"),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(sa.Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default=TrailKind.CUSTOM.value)
    starts_on: Mapped[date | None]
    ends_on: Mapped[date | None]
    status: Mapped[str] = mapped_column(String(20), default=TrailStatus.ACTIVE.value)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class TrailStop(Base):
    __tablename__ = "trail_stop"
    __table_args__ = (
        sa.CheckConstraint("position > 0", name="position"),
        sa.CheckConstraint(
            "NOT required_check_in OR venue_id IS NOT NULL", name="required_venue"
        ),
        sa.UniqueConstraint("trail_id", "position", name="uq_rewards_trail_stop_pos"),
        sa.Index("ix_rewards_trail_stop_venue", "venue_id"),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    trail_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rewards.trail.id", ondelete="CASCADE")
    )
    position: Mapped[int]
    label: Mapped[str] = mapped_column(String(120))
    venue_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rewards.venue.id"))
    #: A required stop must be stamped (by a check-in at its venue) to complete the trail.
    required_check_in: Mapped[bool] = mapped_column(default=True)


class CheckIn(Base):
    """One visit. One per person, venue and Grenada calendar day."""

    __tablename__ = "check_in"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id", "venue_id", "local_date", name="uq_rewards_check_in_day"
        ),
        sa.Index("ix_rewards_check_in_user_date", "user_id", "local_date"),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rewards.venue.id"))
    trail_stop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rewards.trail_stop.id", ondelete="SET NULL")
    )
    local_date: Mapped[date]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class AchievementDefinition(Base):
    """A rule that awards a badge-like achievement. ``organisation_id`` NULL = platform."""

    __tablename__ = "achievement_definition"
    __table_args__ = (
        sa.CheckConstraint(f"rule_type IN ({_values(AchievementRule)})", name="rule"),
        sa.UniqueConstraint("key", name="uq_rewards_achievement_key"),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    key: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(sa.Text, default="")
    rule_type: Mapped[str] = mapped_column(String(40))
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class AchievementAward(Base):
    __tablename__ = "achievement_award"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id", "definition_id", name="uq_rewards_achievement_award"
        ),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    definition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rewards.achievement_definition.id", ondelete="CASCADE")
    )
    awarded_at: Mapped[datetime] = mapped_column(default=utc_now)
