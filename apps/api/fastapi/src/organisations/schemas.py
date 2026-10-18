import uuid
from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints

from src.models import BaseModel, UtcDateTime
from src.organisations.models import (
    MembershipRole,
    MembershipStatus,
    OrganisationKind,
    OrganisationStatus,
)


class OrganisationSummary(BaseModel):
    id: str
    slug: str
    name: str
    kind: OrganisationKind
    status: OrganisationStatus
    verified_at: UtcDateTime | None = None


class MyMembershipPublic(BaseModel):
    membership_id: str
    role: MembershipRole
    status: MembershipStatus
    joined_at: UtcDateTime
    organisation: OrganisationSummary


class CurrentOrganisationPublic(BaseModel):
    """The organisation resolved from ``X-Barrels-Organisation`` and the caller's role."""

    organisation: OrganisationSummary
    role: MembershipRole


class MemberPublic(BaseModel):
    membership_id: str
    user_id: uuid.UUID
    email: str
    full_name: str
    role: MembershipRole
    joined_at: UtcDateTime


class MemberListPublic(BaseModel):
    data: list[MemberPublic]
    count: int
    page: int
    size: int


class MemberRoleUpdate(BaseModel):
    role: MembershipRole


class InvitationCreate(BaseModel):
    email: EmailStr
    role: MembershipRole = MembershipRole.MEMBER


class InvitationPublic(BaseModel):
    """A pending offer. The token is only ever emailed, never returned."""

    id: str
    email: str
    role: MembershipRole
    expires_at: UtcDateTime
    created_at: UtcDateTime
    invited_by_user_id: uuid.UUID | None = None


class InvitationAccept(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class OrganisationAdminPublic(OrganisationSummary):
    """Control-plane row (superuser only): the summary plus size and dates."""

    active_member_count: int
    created_at: UtcDateTime
    updated_at: UtcDateTime


class OrganisationAppPublic(BaseModel):
    app_key: str
    enabled: bool


class AppOptionPublic(BaseModel):
    """An app in the registry that an entitlement can be set for."""

    key: str
    label: str


class OrganisationAdminDetail(OrganisationAdminPublic):
    apps: list[OrganisationAppPublic]
    available_apps: list[AppOptionPublic]


class OrganisationAdminListPublic(BaseModel):
    data: list[OrganisationAdminPublic]
    count: int
    page: int
    size: int


SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"

OrganisationName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]


class PlatformOrganisationCreate(BaseModel):
    name: OrganisationName
    kind: OrganisationKind
    slug: str | None = Field(default=None, max_length=100, pattern=SLUG_PATTERN)


class PlatformOrganisationUpdate(BaseModel):
    """Only the fields sent change. At least one is required."""

    name: OrganisationName | None = None
    slug: str | None = Field(default=None, max_length=100, pattern=SLUG_PATTERN)
    status: OrganisationStatus | None = None
    kind: OrganisationKind | None = None


class VerificationDecision(BaseModel):
    reason: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)
    ]


class AppEntitlementUpdate(BaseModel):
    enabled: bool
