import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import String, Text
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
