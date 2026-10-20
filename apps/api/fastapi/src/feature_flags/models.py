"""Feature flags with success metrics (ADR-0020)."""

import secrets
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


def new_flag_id() -> str:
    return f"flag_{secrets.token_hex(8)}"


class FeatureFlag(Base):
    """One switch. ``audience`` holds validated ``FeatureFlagAudience`` JSON."""

    __tablename__ = "feature_flag"
    __table_args__ = (
        sa.CheckConstraint("key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="key_format"),
        {"schema": "flags"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=new_flag_id)
    key: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(default=False)
    #: Only exposed flags are returned to clients by the evaluate routes.
    exposed: Mapped[bool] = mapped_column(default=False)
    audience: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    success_metric: Mapped[str | None] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(String(255))
    #: Past this the flag evaluates to off and is listed as stale.
    expires_at: Mapped[datetime | None]
    #: Past this the flag is listed as stale (it still evaluates normally).
    review_by: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
