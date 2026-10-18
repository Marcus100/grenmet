"""Platform organisations, memberships and app entitlements (ADR-0022)."""

import secrets
import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class OrganisationKind(str, Enum):
    BARRELS = "barrels"
    CLIENT = "client"
    BUSINESS = "business"


class OrganisationStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class MembershipRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class MembershipStatus(str, Enum):
    ACTIVE = "active"
    INVITED = "invited"
    REMOVED = "removed"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


def new_organisation_id() -> str:
    return f"org_{secrets.token_hex(8)}"


def new_membership_id() -> str:
    return f"mem_{secrets.token_hex(8)}"


def new_invitation_id() -> str:
    return f"inv_{secrets.token_hex(8)}"


class PlatformOrganisation(Base):
    """An organisation that acts on the platform. Ids are immutable; slugs may change.

    Existing HR employers share their ``hr.organisation`` id (Bridge A).
    """

    __tablename__ = "organisation"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(OrganisationKind)})", name="kind"),
        sa.CheckConstraint(f"status IN ({_values(OrganisationStatus)})", name="status"),
        {"schema": "org"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(
        String(20), default=OrganisationStatus.ACTIVE.value
    )
    verified_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class Membership(Base):
    __tablename__ = "membership"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "user_id", name="uq_org_membership_org_user"
        ),
        sa.CheckConstraint(f"role IN ({_values(MembershipRole)})", name="role"),
        sa.CheckConstraint(f"status IN ({_values(MembershipStatus)})", name="status"),
        {"schema": "org"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(
        String(20), default=MembershipStatus.ACTIVE.value
    )
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class OrganisationApp(Base):
    """Which registered apps (``src/auth/apps.py`` keys) an organisation may use."""

    __tablename__ = "organisation_app"
    __table_args__ = {"schema": "org"}

    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE"), primary_key=True
    )
    app_key: Mapped[str] = mapped_column(String(60), primary_key=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class Invitation(Base):
    """An emailed offer to join an organisation (ADR-0022, ADR-0018 challenge pattern).

    Only the SHA-256 of the token is stored, so a database read never yields a
    usable link. An invitation is single-use (``accepted_at``), expiring
    (``expires_at``) and revocable (``revoked_at``).
    """

    __tablename__ = "invitation"
    __table_args__ = (
        sa.CheckConstraint(f"role IN ({_values(MembershipRole)})", name="role"),
        sa.Index("ix_org_invitation_org_email", "organisation_id", "email"),
        {"schema": "org"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    email: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime]
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    accepted_at: Mapped[datetime | None]
    accepted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
