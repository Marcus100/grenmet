import uuid

from pydantic import EmailStr, Field

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


class OrganisationAdminDetail(OrganisationAdminPublic):
    apps: list[OrganisationAppPublic]


class OrganisationAdminListPublic(BaseModel):
    data: list[OrganisationAdminPublic]
    count: int
    page: int
    size: int
