"""Stored model-guidance runs, point series and organisation access requests."""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class AccessRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


class ModelGuidanceRun(Base):
    """One complete model cycle whose point series have been stored."""

    __tablename__ = "model_guidance_run"
    __table_args__ = (
        sa.UniqueConstraint("model", "run_time", name="uq_model_guidance_run"),
        sa.Index("ix_model_guidance_run_model_time", "model", "run_time"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    model: Mapped[str] = mapped_column(String(20))
    #: Model cycle (initialisation) time, naive UTC.
    run_time: Mapped[datetime]
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class ModelGuidanceSeries(Base):
    """Compact point series for one run: ``{"valid_times": [...], <variable>: [...]}``."""

    __tablename__ = "model_guidance_series"
    __table_args__ = (
        sa.UniqueConstraint("run_id", "point_key", name="uq_model_guidance_series"),
        sa.Index("ix_model_guidance_series_run", "run_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("model_guidance_run.id", ondelete="CASCADE")
    )
    point_key: Mapped[str] = mapped_column(String(40))
    latitude: Mapped[float]
    longitude: Mapped[float]
    series: Mapped[dict[str, Any]] = mapped_column(JSONB)


class GuidanceAccessRequest(Base):
    """An organisation's request to use the GMS Dashboard (app ``gmsdash``).

    GMS staff decide it; approval enables ``org.organisation_app`` for the app.
    """

    __tablename__ = "model_guidance_access_request"
    __table_args__ = (
        sa.CheckConstraint(
            f"status IN ({_values(AccessRequestStatus)})", name="status"
        ),
        sa.Index("ix_model_guidance_access_request_org", "organisation_id"),
        sa.Index(
            "uq_model_guidance_access_pending",
            "organisation_id",
            unique=True,
            postgresql_where=sa.text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(20), default=AccessRequestStatus.PENDING.value
    )
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    decision_note: Mapped[str | None] = mapped_column(String(500))
    decided_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
