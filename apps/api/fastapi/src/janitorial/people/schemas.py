from typing import Annotated, Literal
from uuid import UUID

from pydantic import EmailStr, Field

from src.models import BaseModel, UtcDateTime

StaffRole = Literal["cleaner", "contractor_supervisor"]
Name = Annotated[str, Field(min_length=1, max_length=200)]
BadgeNo = Annotated[str | None, Field(min_length=1, max_length=40)]
Revision = Annotated[int, Field(ge=1)]


class JanitorialContractor(BaseModel):
    id: UUID
    name: str
    active: bool
    revision: int


class ContractorCreate(BaseModel):
    name: Name


class ContractorUpdate(BaseModel):
    name: Name
    active: bool
    expectedRevision: Revision


class JanitorialStaffMember(BaseModel):
    id: UUID
    userId: UUID
    # From Barrels Login; null if the account no longer exists.
    name: str | None
    email: str | None
    accountActive: bool
    contractorId: UUID
    role: StaffRole
    badgeNo: str | None
    active: bool
    revision: int


class JanitorialStaffList(BaseModel):
    contractors: list[JanitorialContractor]
    staff: list[JanitorialStaffMember]


class StaffCreate(BaseModel):
    # The cleaner's Barrels Login email; the account must already exist.
    email: EmailStr
    contractorId: UUID
    role: StaffRole = "cleaner"
    badgeNo: BadgeNo = None


class StaffUpdate(BaseModel):
    contractorId: UUID
    role: StaffRole
    badgeNo: BadgeNo
    active: bool
    expectedRevision: Revision


class JanitorialGrant(BaseModel):
    id: UUID
    userId: UUID
    name: str | None
    email: str | None
    buildingId: int
    grantedBy: UUID
    grantedAt: UtcDateTime


class GrantCreate(BaseModel):
    # A GAA supervisor's or manager's Barrels Login email.
    email: EmailStr
    buildingIds: list[int] = Field(min_length=1, max_length=500)
