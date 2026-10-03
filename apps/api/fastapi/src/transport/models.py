"""Transport tables use separate metadata; main-database Alembic must not see them.

Migrations are hand-written in ``migrations/versions``; these models mirror them.
The v1 ``trips`` / ``trip_stops`` tables are read only by the legacy
``/transport/spec`` query in ``router.py`` and have no model here.
"""

from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, MetaData, Numeric, Text, Time, func
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

transport_metadata = MetaData()


class TransportModel(DeclarativeBase):
    """Declarative base for the independently migrated transport database."""

    metadata = transport_metadata


class TimetableVersionStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DISCARDED = "discarded"


class TransportTripStatus(str, Enum):
    CONFIRMED = "confirmed"
    AWAITING_CONFIRMATION = "awaiting_confirmation"


class TransportDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


def _pg_enum(enum: type[Enum], name: str) -> ENUM:
    return ENUM(
        enum,
        name=name,
        create_type=False,
        values_callable=lambda members: [member.value for member in members],
    )


class Route(TransportModel):
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)


class Shift(TransportModel):
    __tablename__ = "shifts"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    sort_order: Mapped[int] = mapped_column(default=0)


class Stop(TransportModel):
    __tablename__ = "stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    code: Mapped[str | None] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    landmark: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)


class ServiceCalendar(TransportModel):
    __tablename__ = "service_calendars"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    monday: Mapped[bool]
    tuesday: Mapped[bool]
    wednesday: Mapped[bool]
    thursday: Mapped[bool]
    friday: Mapped[bool]
    saturday: Mapped[bool]
    sunday: Mapped[bool]
    runs_on_public_holidays: Mapped[bool]
    sort_order: Mapped[int] = mapped_column(default=0)


class TimetableVersion(TransportModel):
    __tablename__ = "timetable_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(Text)
    status: Mapped[TimetableVersionStatus] = mapped_column(
        _pg_enum(TimetableVersionStatus, "timetable_version_status"),
        default=TimetableVersionStatus.DRAFT,
    )
    effective_date: Mapped[date | None] = mapped_column(Date)
    source_ref: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    based_on_id: Mapped[int | None] = mapped_column(ForeignKey("timetable_versions.id"))
    created_by: Mapped[UUID | None]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    published_by: Mapped[UUID | None]
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TimetableTrip(TransportModel):
    __tablename__ = "timetable_trips"
    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("timetable_versions.id"))
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    shift_id: Mapped[int] = mapped_column(ForeignKey("shifts.id"))
    service_calendar_id: Mapped[int] = mapped_column(ForeignKey("service_calendars.id"))
    direction: Mapped[TransportDirection] = mapped_column(
        _pg_enum(TransportDirection, "bus_direction")
    )
    depart_seconds: Mapped[int]
    arrive_seconds: Mapped[int | None]
    status: Mapped[TransportTripStatus] = mapped_column(
        _pg_enum(TransportTripStatus, "trip_status"),
        default=TransportTripStatus.CONFIRMED,
    )
    source_ref: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0)
    legacy_trip_id: Mapped[int | None]


class TimetableStopTime(TransportModel):
    __tablename__ = "timetable_stop_times"
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        ForeignKey("timetable_trips.id", ondelete="CASCADE")
    )
    stop_id: Mapped[int] = mapped_column(ForeignKey("stops.id"))
    stop_sequence: Mapped[int]
    departure_seconds: Mapped[int | None]
    timepoint: Mapped[bool] = mapped_column(default=False)
