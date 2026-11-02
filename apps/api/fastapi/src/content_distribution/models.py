import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class ContentDelivery(Base):
    """One post on one platform. The dedupe key is cms:<collection>:<slug>:<platform>.

    ``payload`` holds the copy and links to post (or, in dry run, the copy that
    would have been posted). It is public content, not personal data.
    """

    __tablename__ = "content_distribution_delivery"
    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('pending', 'scheduled', 'dry_run_sent', 'posted', 'skipped', 'dead')",
            name="content_distribution_delivery_status",
        ),
        sa.Index("ix_content_distribution_delivery_due", "status", "publish_at"),
        sa.Index("ix_content_distribution_delivery_post", "collection", "slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dedupe_key: Mapped[str] = mapped_column(String(300), unique=True)
    collection: Mapped[str] = mapped_column(String(60))
    slug: Mapped[str] = mapped_column(String(200))
    platform: Mapped[str] = mapped_column(String(20))
    url: Mapped[str] = mapped_column(String(2000))
    title: Mapped[str] = mapped_column(String(300))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    attempts: Mapped[int] = mapped_column(default=0)
    external_id: Mapped[str | None] = mapped_column(String(200))
    # Why a post was not sent live (dry run, skipped). Failures use ``error``.
    reason: Mapped[str | None] = mapped_column(String(300))
    # Set just before a live publish request and cleared only when Meta has
    # answered without publishing. Still set with no external_id means the outcome
    # is unknown, so the row is never sent again (see service.post_delivery).
    publish_started_at: Mapped[datetime | None] = mapped_column()
    error: Mapped[str | None] = mapped_column(String(300))
    publish_at: Mapped[datetime] = mapped_column()
    processed_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
