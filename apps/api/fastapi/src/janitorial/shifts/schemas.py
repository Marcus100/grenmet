from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from src.models import BaseModel

Clock = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
Name = Annotated[str, Field(min_length=1, max_length=100)]
Note = Annotated[str | None, Field(max_length=4000)]
Revision = Annotated[int, Field(ge=1)]
AreaIds = Annotated[list[int], Field(max_length=1000)]
AssignmentStatus = Literal["scheduled", "cancelled"]


class JanitorialShiftPattern(BaseModel):
    id: int
    siteId: int
    name: str
    # HH:MM; a shift ending before it starts runs past midnight.
    startsAt: str
    endsAt: str
    active: bool
    revision: int


class ShiftPatternCreate(BaseModel):
    siteId: int
    name: Name
    startsAt: Clock
    endsAt: Clock


class ShiftPatternUpdate(BaseModel):
    name: Name
    startsAt: Clock
    endsAt: Clock
    active: bool
    expectedRevision: Revision


class JanitorialZone(BaseModel):
    id: int
    siteId: int
    name: str
    areaIds: list[int]
    active: bool
    revision: int


class ZoneCreate(BaseModel):
    siteId: int
    name: Name
    areaIds: AreaIds = []


class ZoneUpdate(BaseModel):
    name: Name
    areaIds: AreaIds
    active: bool
    expectedRevision: Revision


class JanitorialShiftAssignment(BaseModel):
    id: UUID
    workDate: date
    shiftPatternId: int
    staffId: UUID
    zoneId: int
    status: AssignmentStatus
    note: str | None
    revision: int


class ShiftAssignmentCreate(BaseModel):
    workDate: date
    shiftPatternId: int
    staffId: UUID
    zoneId: int
    note: Note = None


class ShiftAssignmentUpdate(BaseModel):
    # To move work to another person, cancel this assignment and add a new one.
    shiftPatternId: int
    zoneId: int
    status: AssignmentStatus
    note: Note = None
    expectedRevision: Revision


class JanitorialShiftBoard(BaseModel):
    patterns: list[JanitorialShiftPattern]
    zones: list[JanitorialZone]
    assignments: list[JanitorialShiftAssignment]
