import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class ContactSite(str, Enum):
    MBIA = "mbia"
    BARRELS = "barrels"


class ContactMessage(Base):
    """A message from a public website contact form, stored before it is mailed."""

    __tablename__ = "contact_message"
    __table_args__ = (sa.Index("ix_contact_message_site", "site", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    site: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class ContactDataRequest(Base):
    """A climate data request from the GMS website, stored before it is mailed."""

    __tablename__ = "contact_data_request"
    __table_args__ = (sa.Index("ix_contact_data_request_site", "site", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    site: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320))
    organisation: Mapped[str] = mapped_column(String(200))
    purpose: Mapped[str] = mapped_column(Text)
    parameters: Mapped[list[str]] = mapped_column(JSON)
    stations: Mapped[str] = mapped_column(String(500))
    period_start: Mapped[date] = mapped_column()
    period_end: Mapped[date] = mapped_column()
    data_format: Mapped[str] = mapped_column(String(20))
    intended_use: Mapped[str] = mapped_column(String(20))
    consent_at: Mapped[datetime] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
