"""Janitorial tables use separate metadata; main-database Alembic must not see them.

Migrations are hand-written in ``migrations/versions``; these models mirror them.
The v1 ``/janitorial/spec`` query in ``router.py`` reads with raw SQL and needs
no model. User ids are Barrels Login UUIDs with no cross-database foreign key.
"""

from datetime import date, datetime, time
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Date,
    DateTime,
    FetchedValue,
    ForeignKey,
    MetaData,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

janitorial_metadata = MetaData()


class JanitorialModel(DeclarativeBase):
    """Declarative base for the independently migrated janitorial database."""

    metadata = janitorial_metadata


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Site(JanitorialModel):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)


class Building(JanitorialModel):
    __tablename__ = "buildings"
    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    name: Mapped[str] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text, unique=True)
    kind: Mapped[str] = mapped_column(Text, default="other")
    sort_order: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)


class Section(JanitorialModel):
    __tablename__ = "sections"
    id: Mapped[int] = mapped_column(primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"))
    name: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)


class Area(JanitorialModel):
    __tablename__ = "areas"
    id: Mapped[int] = mapped_column(primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"))
    section_id: Mapped[int | None] = mapped_column(ForeignKey("sections.id"))
    name: Mapped[str] = mapped_column(Text)
    # Filled by the ``areas_defaults`` trigger when omitted on insert.
    code: Mapped[str] = mapped_column(Text, unique=True, server_default=FetchedValue())
    space_type: Mapped[str] = mapped_column(Text, server_default=FetchedValue())
    cleanliness_level: Mapped[int | None] = mapped_column(server_default=FetchedValue())
    quantity: Mapped[int] = mapped_column(default=1)
    sort_order: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)


class Activity(JanitorialModel):
    __tablename__ = "activities"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)


class AreaTask(JanitorialModel):
    __tablename__ = "area_tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id"))
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"))
    freq_count: Mapped[int]
    freq_period_value: Mapped[int]
    freq_period_unit: Mapped[str] = mapped_column(
        ENUM("minute", "day", name="period_unit", create_type=False)
    )
    mode: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)


class Contractor(JanitorialModel):
    __tablename__ = "contractors"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(Text, unique=True)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)
    created_by: Mapped[UUID]
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class Staff(JanitorialModel):
    __tablename__ = "staff"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(unique=True)
    contractor_id: Mapped[UUID] = mapped_column(ForeignKey("contractors.id"))
    role: Mapped[str] = mapped_column(Text)
    badge_no: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)
    created_by: Mapped[UUID]
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class BuildingGrant(JanitorialModel):
    __tablename__ = "building_grants"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID]
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"))
    granted_by: Mapped[UUID]
    granted_at: Mapped[datetime] = _now()
    revoked_by: Mapped[UUID | None]
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ShiftPattern(JanitorialModel):
    __tablename__ = "shift_patterns"
    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    name: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[time] = mapped_column(Time)
    ends_at: Mapped[time] = mapped_column(Time)
    sort_order: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)


class Zone(JanitorialModel):
    __tablename__ = "zones"
    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    name: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)


class ZoneArea(JanitorialModel):
    __tablename__ = "zone_areas"
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), primary_key=True)
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id"), primary_key=True)


class ShiftAssignment(JanitorialModel):
    __tablename__ = "shift_assignments"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    work_date: Mapped[date] = mapped_column(Date)
    shift_pattern_id: Mapped[int] = mapped_column(ForeignKey("shift_patterns.id"))
    staff_id: Mapped[UUID] = mapped_column(ForeignKey("staff.id"))
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"))
    status: Mapped[str] = mapped_column(Text, default="scheduled")
    note: Mapped[str | None] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(default=1)
    created_by: Mapped[UUID]
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class ChangeEvent(JanitorialModel):
    __tablename__ = "change_events"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column(Text)
    revision: Mapped[int]
    action: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[UUID]
    recorded_at: Mapped[datetime] = _now()
    changes: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
