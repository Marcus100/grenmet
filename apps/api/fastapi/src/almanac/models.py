"""Almanac tables (main database, ``almanac`` schema). Datetimes are naive UTC.

- ``astro_day``: one row per location and Grenada local date (sun, twilight, moon).
- ``moon_phase_event``: one row per principal phase (Grenada local date, +/-1 day).
- ``tide_prediction``: one row per predicted high or low water and station.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base


class AstroDay(Base):
    __tablename__ = "astro_day"
    __table_args__ = (
        sa.UniqueConstraint("location_key", "local_date", name="uq_almanac_astro_day"),
        {"schema": "almanac"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    location_key: Mapped[str] = mapped_column(String(40))
    local_date: Mapped[date]
    sunrise_utc: Mapped[datetime]
    sunset_utc: Mapped[datetime]
    civil_dawn_utc: Mapped[datetime]
    civil_dusk_utc: Mapped[datetime]
    moonrise_utc: Mapped[datetime | None]
    moonset_utc: Mapped[datetime | None]
    moon_phase: Mapped[str] = mapped_column(String(30))


class MoonPhaseEvent(Base):
    __tablename__ = "moon_phase_event"
    __table_args__ = (
        sa.UniqueConstraint("phase_key", "local_date", name="uq_almanac_moon_phase"),
        sa.CheckConstraint(
            "phase_key IN ('new', 'first_quarter', 'full', 'last_quarter')",
            name="phase_key",
        ),
        {"schema": "almanac"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    phase_key: Mapped[str] = mapped_column(String(20))
    local_date: Mapped[date]


class TidePrediction(Base):
    __tablename__ = "tide_prediction"
    __table_args__ = (
        sa.UniqueConstraint(
            "station_key", "time_utc", name="uq_almanac_tide_station_time"
        ),
        sa.CheckConstraint("event_type IN ('HIGH', 'LOW')", name="event_type"),
        {"schema": "almanac"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    station_key: Mapped[str] = mapped_column(String(20))
    event_type: Mapped[str] = mapped_column(String(4))
    time_utc: Mapped[datetime]
    #: Metres relative to provisional MLLW.
    height_m_mllw: Mapped[Decimal] = mapped_column(sa.Numeric(8, 4))
    timing_quality: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(80))
    source_label: Mapped[str] = mapped_column(String(120))
    source_version: Mapped[str] = mapped_column(String(20))
