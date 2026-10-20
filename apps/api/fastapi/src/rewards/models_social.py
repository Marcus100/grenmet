"""Social-layer tables (PF10, ``rewards`` schema): leaderboard opt-ins, community
challenges and stamp gifts.

Nothing here holds value. Boards rank real-world action counts only; challenges
are collective and compute progress from check-ins and the ledger on read; a gift
is a collectible passport record, never a ``rewards.entry`` row, so it can be
neither redeemed nor re-gifted. Banned and unrepresentable: ranking by spend,
random prizes, cash-out, buying stamps or points.
"""

import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

from .models import _values


class ScopeKind(str, Enum):
    ORGANISATION = "organisation"
    TRAIL = "trail"


class ChallengeMetric(str, Enum):
    """Real-world action counts only. Never an amount of money."""

    VENUE_CHECK_INS = "venue_check_ins"
    TRAIL_STOPS = "trail_stops"
    EVENTS_ATTENDED = "events_attended"


class ChallengeStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"


class GiftKind(str, Enum):
    #: The only kind. Merchant stamps and ledger entries are never giftable.
    PASSPORT_STAMP = "passport_stamp"


class LeaderboardOptIn(Base):
    """Consent to appear on one board. Withdrawal (``withdrawn_at``) removes the
    person from that board at once; people are never listed without an active row."""

    __tablename__ = "leaderboard_opt_in"
    __table_args__ = (
        sa.CheckConstraint(f"scope_kind IN ({_values(ScopeKind)})", name="scope_kind"),
        sa.UniqueConstraint(
            "user_id", "scope_kind", "scope_id", name="uq_rewards_opt_in_scope"
        ),
        sa.Index("ix_rewards_opt_in_scope", "scope_kind", "scope_id"),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    scope_kind: Mapped[str] = mapped_column(String(20))
    scope_id: Mapped[str] = mapped_column(String(100))
    display_alias: Mapped[str | None] = mapped_column(String(40))
    #: False (default) = hidden name: the alias is shown, never the real name.
    show_name: Mapped[bool] = mapped_column(default=False)
    opted_in_at: Mapped[datetime] = mapped_column(default=utc_now)
    withdrawn_at: Mapped[datetime | None]


class Challenge(Base):
    """A community goal. ``organisation_id`` NULL = platform challenge. The reward
    is text for humans to honour; it creates no ledger value."""

    __tablename__ = "challenge"
    __table_args__ = (
        sa.CheckConstraint(f"metric IN ({_values(ChallengeMetric)})", name="metric"),
        sa.CheckConstraint(f"status IN ({_values(ChallengeStatus)})", name="status"),
        sa.CheckConstraint("target_total > 0", name="target"),
        sa.CheckConstraint("starts_at < ends_at", name="window"),
        sa.Index("ix_rewards_challenge_organisation", "organisation_id"),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(sa.Text, default="")
    metric: Mapped[str] = mapped_column(String(30))
    target_total: Mapped[int]
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    reward_description: Mapped[str] = mapped_column(sa.Text, default="")
    status: Mapped[str] = mapped_column(
        String(20), default=ChallengeStatus.ACTIVE.value
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class ChallengeProgress(Base):
    """Completion marker only. The running total is always computed from records on
    read; there is no counter to increment."""

    __tablename__ = "challenge_progress"
    __table_args__ = {"schema": "rewards"}

    challenge_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rewards.challenge.id", ondelete="CASCADE"), primary_key=True
    )
    completed_at: Mapped[datetime] = mapped_column(default=utc_now)
    total_at_completion: Mapped[int]


class Gift(Base):
    """A passport stamp copied to another account as a souvenir. Audit-friendly:
    rows are never deleted, a reversal sets ``reversed_at``."""

    __tablename__ = "gift"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(GiftKind)})", name="kind"),
        sa.CheckConstraint("from_user_id <> to_user_id", name="not_self"),
        sa.Index("ix_rewards_gift_from", "from_user_id", "created_at"),
        sa.Index("ix_rewards_gift_to", "to_user_id"),
        # One live gift per source check-in: a received gift has no check-in, so it
        # can never be gifted again (no chains).
        sa.Index(
            "uq_rewards_gift_live_source",
            "check_in_id",
            unique=True,
            postgresql_where=sa.text("reversed_at IS NULL"),
        ),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    kind: Mapped[str] = mapped_column(String(20), default=GiftKind.PASSPORT_STAMP.value)
    check_in_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rewards.check_in.id"))
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rewards.venue.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    reversed_at: Mapped[datetime | None]
