"""Rewards tables (main database, ``rewards`` schema).

Rewards follow completed real-world actions (an admission at the door), never
attention. Points and stamps are non-monetary: no cash-out, no transfer between
people, no purchase. The ledger is append-only: a database trigger refuses
DELETE and any UPDATE that touches a column other than the settlement fields
(``status``, ``settled_at``, ``settled_by_user_id``), and a reversal is a new
negating entry, never an edit of the original.
"""

import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class ProgramKind(str, Enum):
    STAMP_CARD = "stamp_card"


class ProgramStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"


class EntryKind(str, Enum):
    EARN = "earn"
    REDEEM = "redeem"
    REVERSE = "reverse"
    ADJUST = "adjust"


class EntryStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REVERSED = "reversed"


class FlagReason(str, Enum):
    VELOCITY = "velocity"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


class Program(Base):
    """An organisation-funded stamp card: ``stamps_required`` stamps earn the reward."""

    __tablename__ = "program"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(ProgramKind)})", name="kind"),
        sa.CheckConstraint(f"status IN ({_values(ProgramStatus)})", name="status"),
        sa.CheckConstraint("stamps_required > 0", name="stamps_required"),
        sa.CheckConstraint("stamps_per_source > 0", name="stamps_per_source"),
        sa.CheckConstraint(
            "max_redemptions_per_account IS NULL OR max_redemptions_per_account > 0",
            name="max_redemptions",
        ),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default=ProgramKind.STAMP_CARD.value)
    stamps_required: Mapped[int]
    reward_description: Mapped[str] = mapped_column(sa.Text)
    #: What earns a stamp, e.g. ``events.admission`` (an admission at this organiser).
    qualifying_source_type: Mapped[str] = mapped_column(
        String(60), default="events.admission"
    )
    stamps_per_source: Mapped[int] = mapped_column(default=1)
    #: Lifetime cap of redemptions for one account; NULL = unlimited.
    max_redemptions_per_account: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(20), default=ProgramStatus.ACTIVE.value)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class Entry(Base):
    """One signed movement of stamps. ``amount`` is positive for earn/credit
    and negative for redeem/debit; balances are sums, never stored."""

    __tablename__ = "entry"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(EntryKind)})", name="kind"),
        sa.CheckConstraint(f"status IN ({_values(EntryStatus)})", name="status"),
        sa.CheckConstraint("amount <> 0", name="amount_nonzero"),
        sa.CheckConstraint("kind <> 'earn' OR amount > 0", name="earn_positive"),
        sa.CheckConstraint("kind <> 'redeem' OR amount < 0", name="redeem_negative"),
        sa.CheckConstraint(
            "kind <> 'adjust' OR (reason IS NOT NULL AND created_by_user_id IS NOT NULL)",
            name="adjust_needs_reason",
        ),
        sa.CheckConstraint(
            "kind <> 'reverse' OR reverses_entry_id IS NOT NULL",
            name="reverse_needs_target",
        ),
        sa.Index("ix_rewards_entry_account_program", "account_id", "program_id"),
        sa.Index(
            "uq_rewards_entry_earn_source",
            "program_id",
            "source_type",
            "source_id",
            unique=True,
            postgresql_where=sa.text("kind = 'earn' AND source_id IS NOT NULL"),
        ),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rewards.program.id"))
    kind: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int]
    status: Mapped[str] = mapped_column(String(10))
    transaction_ref: Mapped[str] = mapped_column(String(160), unique=True)
    source_type: Mapped[str | None] = mapped_column(String(60))
    source_id: Mapped[str | None] = mapped_column(String(120))
    reverses_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rewards.entry.id"), unique=True
    )
    #: Short code a customer shows staff to confirm a pending redemption.
    redeem_code: Mapped[str | None] = mapped_column(String(12), unique=True)
    reason: Mapped[str | None] = mapped_column(sa.Text)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    settled_at: Mapped[datetime | None]
    settled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )


class ReviewFlag(Base):
    """A suspicious-activity flag for a person to review. Never blocks the account."""

    __tablename__ = "review_flag"
    __table_args__ = (
        sa.CheckConstraint(f"reason IN ({_values(FlagReason)})", name="reason"),
        sa.Index(
            "uq_rewards_flag_open",
            "account_id",
            "reason",
            unique=True,
            postgresql_where=sa.text("resolved_at IS NULL"),
        ),
        {"schema": "rewards"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    reason: Mapped[str] = mapped_column(String(20))
    detail: Mapped[str] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    resolved_at: Mapped[datetime | None]
    resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    resolution_note: Mapped[str | None] = mapped_column(sa.Text)
