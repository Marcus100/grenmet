"""Platform organisations, memberships and app entitlements (ADR-0022)."""

import secrets
import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY
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


class VerificationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


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


def new_grant_id() -> str:
    return f"grant_{secrets.token_hex(8)}"


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
        sa.CheckConstraint(
            f"verification_status IN ({_values(VerificationStatus)})",
            name="verification_status",
        ),
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
    #: Moderation state; ``verified_at`` stays the single "is verified" signal.
    verification_status: Mapped[str] = mapped_column(
        String(20),
        default=VerificationStatus.PENDING.value,
        server_default=VerificationStatus.PENDING.value,
    )
    #: Reason given with the latest decision (approve, reject or unverify).
    verification_reason: Mapped[str | None] = mapped_column(sa.Text)
    verification_decided_at: Mapped[datetime | None]
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


class MembershipGrant(Base):
    """An extra role a member holds in one organisation (ADR-0044, S1).

    ``role_key`` names a product-owned bundle (``role_bundles.py``); the bundle's
    organisation keys are resolved by ``grants.effective_keys``. A grant ends at
    ``expires_at`` or ``revoked_at``; rows are never deleted so history stays.
    A member holds at most one live grant per ``role_key``.
    """

    __tablename__ = "membership_grant"
    __table_args__ = (
        sa.Index(
            "uq_membership_grant_live",
            "membership_id",
            "role_key",
            unique=True,
            postgresql_where=sa.text("revoked_at IS NULL"),
        ),
        sa.Index("membership_grant_organisation_id_idx", "organisation_id"),
        {"schema": "org"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    membership_id: Mapped[str] = mapped_column(
        ForeignKey("org.membership.id", ondelete="CASCADE")
    )
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    role_key: Mapped[str] = mapped_column(String(60))
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    granted_at: Mapped[datetime] = mapped_column(default=utc_now)
    expires_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]


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


class TurnstileMode(str, Enum):
    """Bot check for one public site's forms.

    ``inherit`` uses the global ``TURNSTILE_*`` settings, ``off`` skips the check
    and ``enforce`` requires the site's own secret (503 while it is unset).
    """

    INHERIT = "inherit"
    OFF = "off"
    ENFORCE = "enforce"


def new_public_site_id() -> str:
    return f"site_{secrets.token_hex(8)}"


class PublicSite(Base):
    """A public website or list owned by an organisation (ADR-0025 N1/N2).

    Public forms name a site by its immutable ``key``; the row holds what used to
    be per-site environment settings. Null settings fall back to the environment
    during the deprecation window. The Turnstile secret is stored encrypted
    (``src/utils/secret_box.py``) and is never returned by the API.
    """

    __tablename__ = "public_site"
    __table_args__ = (
        sa.CheckConstraint(r"key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="key_format"),
        sa.CheckConstraint(
            f"turnstile_mode IN ({_values(TurnstileMode)})", name="turnstile_mode"
        ),
        sa.Index("public_site_organisation_id_idx", "organisation_id"),
        {"schema": "org"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    # 40 matches contact_message.site and list_subscription.list_key.
    key: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    site_url: Mapped[str | None] = mapped_column(String(255))
    contact_recipient: Mapped[str | None] = mapped_column(String(254))
    accepts_contact: Mapped[bool] = mapped_column(default=False)
    accepts_subscriptions: Mapped[bool] = mapped_column(default=False)
    turnstile_mode: Mapped[str] = mapped_column(
        String(20), default=TurnstileMode.INHERIT.value
    )
    turnstile_site_key: Mapped[str | None] = mapped_column(String(255))
    turnstile_secret_encrypted: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


def new_api_key_id() -> str:
    return f"key_{secrets.token_hex(8)}"


class ApiKey(Base):
    """A non-browser credential for one organisation (ADR-0029, PF5).

    Only the SHA-256 of the secret is stored, so a database read never yields a
    usable key. ``key_prefix`` is the public part shown in lists. A key works
    until ``expires_at`` or ``revoked_at``; rotation links the new key through
    ``rotated_from_id`` and shortens the old key's ``expires_at``.
    """

    __tablename__ = "api_key"
    __table_args__ = (
        sa.Index("api_key_organisation_id_idx", "organisation_id"),
        {"schema": "org"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(120))
    key_prefix: Mapped[str] = mapped_column(String(8))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(String(60)), default=list)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime | None]
    last_used_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]
    rotated_from_id: Mapped[str | None] = mapped_column(
        ForeignKey("org.api_key.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
