"""Latest fetched series per kind and point (main database, ``environment`` schema).

One row per (kind, point): each successful fetch replaces the row, so the table
stays tiny and a failed fetch leaves the previous series in place.
"""

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class EnvironmentSeries(Base):
    __tablename__ = "series"
    __table_args__ = (
        sa.UniqueConstraint("kind", "point_id", name="uq_environment_series_point"),
        sa.CheckConstraint("kind IN ('marine', 'air')", name="kind"),
        {"schema": "environment"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(20))
    point_id: Mapped[str] = mapped_column(String(60))
    # Provider run / forecast issue time and the time we fetched it (naive UTC).
    issued_at: Mapped[datetime]
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)
    # Dataset ids the values came from, comma separated.
    products: Mapped[str] = mapped_column(String(300))
    # Compact list of {time, <variable>: value} rows, oldest first.
    rows: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
