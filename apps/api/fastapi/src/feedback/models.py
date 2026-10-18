import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class PageFeedback(Base):
    """One anonymous "Was this page helpful?" answer. Holds no personal data."""

    __tablename__ = "page_feedback"
    __table_args__ = (sa.Index("ix_page_feedback_site", "site", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    site: Mapped[str] = mapped_column(String(40))
    page_path: Mapped[str] = mapped_column(String(300))
    helpful: Mapped[bool] = mapped_column()
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
