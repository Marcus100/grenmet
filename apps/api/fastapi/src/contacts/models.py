"""Organisation contacts (ADR-0028, main database, ``org`` schema).

``org.contact`` is one person an organisation serves, matched across products by
the exact HMAC email hash and never by anything else. ``org.contact_consent`` is
an append-only history of consent decisions per purpose; the current decision is
the latest row. Datetimes are naive UTC.
"""

import secrets
import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class ConsentPurpose(str, Enum):
    MARKETING = "marketing"
    SERVICE = "service"
    ANALYTICS = "analytics"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


def new_contact_id() -> str:
    return f"con_{secrets.token_hex(8)}"


class Contact(Base):
    __tablename__ = "contact"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "email_hash", name="contact_organisation_email_hash"
        ),
        {"schema": "org"},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_contact_id
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    #: HMAC of the normalised address (``src.utils.email_hash``); kept as the
    #: tombstone after erasure.
    email_hash: Mapped[str] = mapped_column(String(64))
    #: Kept only while the address is needed to send; blanked on erasure.
    email: Mapped[str | None] = mapped_column(String(320))
    name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    #: Optional Barrels ID link. Deliberately not a foreign key: deleting an
    #: account must never cascade into an organisation's contact book.
    user_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    #: Free-text key of the first system that knew this person.
    source: Mapped[str] = mapped_column(String(40))
    erased_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class ContactConsent(Base):
    """One consent decision. Rows are only ever inserted (merge re-parents them)."""

    __tablename__ = "contact_consent"
    __table_args__ = (
        sa.CheckConstraint(f"purpose IN ({_values(ConsentPurpose)})", name="purpose"),
        sa.Index(
            "contact_consent_contact_purpose_idx",
            "contact_id",
            "purpose",
            "recorded_at",
        ),
        {"schema": "org"},
    )

    id: Mapped[int] = mapped_column(
        BigInteger, sa.Identity(), primary_key=True, autoincrement=True
    )
    contact_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.contact.id", ondelete="CASCADE"), index=True
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str] = mapped_column(String(20))
    granted: Mapped[bool]
    source: Mapped[str] = mapped_column(String(40))
    granted_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]
    recorded_at: Mapped[datetime] = mapped_column(default=utc_now)
